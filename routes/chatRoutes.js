const express = require('express');
const router = express.Router();
const { pineconeClient } = require('../clients/pinecone');
const getEmbeddings = require('../clients/jina');
const QAKnowledgeBase = require('../models/qaKnowledgeBase');
const QueryLog = require('../models/queryLog');
const SearchFeedback = require('../models/searchFeedback');
const QueryPattern = require('../models/queryPattern');
const ollama = require('../clients/ollama');

// Enhanced cosine similarity with normalization
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// Smart query analyzer - learns from past patterns
class QueryAnalyzer {
  static async analyzeQuery(query, userId) {
    try {
      // Get user's past successful queries
      const pastQueries = await QueryLog.find({ user: userId })
        .sort({ timestamp: -1 })
        .limit(20);
      
      // Get global successful query patterns
      const patterns = await QueryPattern.find()
        .sort({ successRate: -1 })
        .limit(10);
      
      // Extract query features
      const features = {
        hasName: /\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/.test(query),
        hasSkills: this.extractSkills(query),
        hasRole: this.extractRole(query),
        hasExperience: /\d+\s*years?/.test(query),
        queryLength: query.split(' ').length,
        queryType: this.classifyQueryType(query)
      };
      
      const suggestedRewrite = await this.generateSmartRewrite(query, patterns, pastQueries);
      
      return {
        features,
        suggestedRewrite,
        confidence: this.calculateConfidence(features, patterns)
      };
    } catch (error) {
      console.error('Error in query analysis:', error);
      return {
        features: {
          hasName: false,
          hasSkills: [],
          hasRole: [],
          hasExperience: false,
          queryLength: query.split(' ').length,
          queryType: 'general'
        },
        suggestedRewrite: query,
        confidence: 0.5
      };
    }
  }
  
  static extractSkills(query) {
    const commonSkills = [
      'javascript', 'react', 'node', 'python', 'java', 'angular', 'vue',
      'typescript', 'sql', 'mongodb', 'aws', 'docker', 'kubernetes',
      'machine learning', 'ai', 'data science', 'devops', 'frontend', 'backend',
      'html', 'css', 'express', 'django', 'flask', 'spring', 'laravel',
      'git', 'jenkins', 'redis', 'elasticsearch', 'graphql', 'rest api'
    ];
    
    const queryLower = query.toLowerCase();
    return commonSkills.filter(skill => queryLower.includes(skill));
  }
  
  static extractRole(query) {
    const commonRoles = [
      'developer', 'engineer', 'architect', 'manager', 'lead', 'senior',
      'junior', 'intern', 'consultant', 'analyst', 'designer', 'devops',
      'fullstack', 'full-stack', 'backend', 'frontend', 'software engineer',
      'data scientist', 'ml engineer', 'product manager', 'tech lead'
    ];
    
    const queryLower = query.toLowerCase();
    return commonRoles.filter(role => queryLower.includes(role));
  }
  
  static classifyQueryType(query) {
    const queryLower = query.toLowerCase();
    
    if (/\b[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/.test(query) && query.split(' ').length <= 3) {
      return 'name_search';
    } else if (queryLower.includes('with') || queryLower.includes('having') || queryLower.includes('skilled in')) {
      return 'skill_based';
    } else if (queryLower.includes('years') || queryLower.includes('experience')) {
      return 'experience_based';
    } else if (queryLower.includes('location') || queryLower.includes('based in')) {
      return 'location_based';
    } else {
      return 'general';
    }
  }
  
  static async generateSmartRewrite(query, patterns, pastQueries) {
    // Check if Ollama is available
    const isOllamaAvailable = await ollama.isAvailable();
    if (!isOllamaAvailable) {
      // Fallback: Simple query enhancement
      return this.enhanceQuerySimple(query);
    }

    try {
      const contextPatterns = patterns.slice(0, 3).map(p => 
        `"${p.originalQuery}" → "${p.rewrittenQuery}"`
      ).join('\n');
      
      const prompt = `You are an expert at rewriting resume search queries for better results.

Examples of good rewrites:
${contextPatterns}

Current query: "${query}"

Rewrite this query to be more specific and likely to find relevant resumes. Consider:
- If it's too vague, add relevant skills or roles
- If it's a name only, keep it simple
- If it's missing context, add industry-relevant terms
- Keep it concise but specific

Provide only the rewritten query, nothing else:`;

      const response = await ollama.generate(prompt);
      return response.trim() || query;
    } catch (error) {
      console.error('Error generating smart rewrite:', error);
      return this.enhanceQuerySimple(query);
    }
  }
  
  static enhanceQuerySimple(query) {
    // Simple enhancement fallback
    const queryLower = query.toLowerCase();
    
    // If it's just a skill, add "developer" or "engineer"
    if (queryLower.match(/^(javascript|python|java|react|node|angular)$/)) {
      return `${query} developer`;
    }
    
    // If it's just a role, add "experience"
    if (queryLower.match(/^(developer|engineer|manager)$/)) {
      return `${query} experience`;
    }
    
    return query;
  }
  
  static calculateConfidence(features, patterns) {
    let confidence = 0.3; // Base confidence
    
    // Adjust based on query features
    if (features.hasName) confidence += 0.2;
    if (features.hasSkills.length > 0) confidence += 0.1 * Math.min(features.hasSkills.length, 3);
    if (features.hasRole.length > 0) confidence += 0.1 * Math.min(features.hasRole.length, 2);
    if (features.hasExperience) confidence += 0.1;
    if (features.queryLength > 2) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }
}

// Advanced result reranker
class ResultReranker {
  static async rerank(results, query, userId, queryAnalysis) {
    try {
      const userFeedback = await SearchFeedback.find({ user: userId })
        .sort({ timestamp: -1 })
        .limit(50);
      
      const rerankedResults = results.map(result => {
        const score = result.score || 0;
        
        // Apply user feedback scoring
        const feedbackScore = this.calculateFeedbackScore(result, userFeedback);
        
        // Apply query-specific scoring
        const queryScore = this.calculateQueryScore(result, queryAnalysis);
        
        // Apply recency scoring
        const recencyScore = this.calculateRecencyScore(result);
        
        // Weighted final score
        const finalScore = (
          0.5 * score +           // Original Pinecone similarity
          0.2 * feedbackScore +   // User feedback
          0.2 * queryScore +      // Query analysis
          0.1 * recencyScore      // Recency
        );
        
        return {
          ...result,
          originalScore: score,
          feedbackScore,
          queryScore,
          recencyScore,
          finalScore
        };
      });
      
      return rerankedResults.sort((a, b) => b.finalScore - a.finalScore);
    } catch (error) {
      console.error('Error in reranking:', error);
      return results.map(r => ({ ...r, finalScore: r.score || 0, originalScore: r.score || 0 }));
    }
  }
  
  static calculateFeedbackScore(result, userFeedback) {
    const relevantFeedback = userFeedback.filter(f => 
      f.resultId === result.metadata?.id || 
      f.resultId === result.metadata?.name
    );
    
    if (relevantFeedback.length === 0) return 0.5;
    
    const avgRating = relevantFeedback.reduce((sum, f) => sum + f.rating, 0) / relevantFeedback.length;
    return avgRating / 5; // Normalize to 0-1
  }
  
  static calculateQueryScore(result, queryAnalysis) {
    let score = 0.5;
    const metadata = result.metadata || {};
    const metadataText = JSON.stringify(metadata).toLowerCase();
    
    // Skills matching
    if (queryAnalysis.features.hasSkills.length > 0) {
      const matchingSkills = queryAnalysis.features.hasSkills.filter(skill =>
        metadataText.includes(skill.toLowerCase())
      );
      score += (matchingSkills.length / queryAnalysis.features.hasSkills.length) * 0.3;
    }
    
    // Role matching
    if (queryAnalysis.features.hasRole.length > 0) {
      const matchingRoles = queryAnalysis.features.hasRole.filter(role =>
        metadataText.includes(role.toLowerCase())
      );
      score += (matchingRoles.length / queryAnalysis.features.hasRole.length) * 0.2;
    }
    
    return Math.min(score, 1.0);
  }
  
  static calculateRecencyScore(result) {
    const processedDate = new Date(result.metadata?.processedAt || result.metadata?.createdAt || Date.now());
    const daysSinceProcessed = (Date.now() - processedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return Math.max(0, 1 - (daysSinceProcessed / 180)); // Decay over 6 months
  }
}

// Helper function to generate search suggestions
async function generateSearchSuggestions(query, userId) {
  const isOllamaAvailable = await ollama.isAvailable();
  if (!isOllamaAvailable) {
    return [
      'Try searching with specific skills (e.g., "JavaScript developer")',
      'Include years of experience (e.g., "5 years React")',
      'Search by role title (e.g., "Senior Engineer")',
      'Combine skills and roles (e.g., "Python data scientist")'
    ];
  }

  try {
    const prompt = `Based on the search query "${query}" that returned no results, suggest 4 alternative search terms for finding resumes/CVs:

1. Different skill combinations
2. Role variations  
3. Experience levels
4. Industry-specific terms

Provide only the 4 suggestions, one per line:`;

    const response = await ollama.generate(prompt);
    return response.trim()
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 4)
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return [
      'Try searching with specific skills',
      'Include years of experience',
      'Search by role title',
      'Combine skills and roles'
    ];
  }
}

// Enhanced chat endpoint with proper response format
router.post('/', async (req, res) => {
  try {
    const { query, feedback } = req.body;
    const userId = req.user?.id;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Valid query string is required' });
    }

    // Record feedback from previous search if provided
    if (feedback) {
      try {
        await SearchFeedback.create({
          user: userId,
          query: feedback.query,
          resultId: feedback.resultId,
          rating: feedback.rating,
          interaction: feedback.interaction,
          timestamp: new Date()
        });
      } catch (feedbackError) {
        console.error('Error recording feedback:', feedbackError);
      }
    }

    // Analyze query using AI
    const queryAnalysis = await QueryAnalyzer.analyzeQuery(query, userId);
    console.log('Query Analysis:', queryAnalysis);
    
    // Check QA knowledge base first
    let bestMatch = null;
    let bestScore = 0.85;
    
    try {
      const queryEmbedding = await getEmbeddings([queryAnalysis.suggestedRewrite || query]);
      
      if (queryEmbedding && queryEmbedding[0] && queryEmbedding[0].embedding) {
        const allQAs = await QAKnowledgeBase.find();
        
        for (const qa of allQAs) {
          if (qa.embedding && qa.embedding.length === queryEmbedding[0].embedding.length) {
            const score = cosineSimilarity(queryEmbedding[0].embedding, qa.embedding);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = qa;
            }
          }
        }
        
        if (bestMatch) {
          console.log('Found cached result with score:', bestScore);
          
          // Reconstruct references from cached data
          const Pdf = require('../models/pdfModel');
          let references = [];
          
          if (bestMatch.references && bestMatch.references.length > 0) {
            try {
              const pdfDocs = await Pdf.find({
                $or: [
                  { originalname: { $in: bestMatch.references } },
                  { _id: { $in: bestMatch.references } }
                ]
              });
              
              references = pdfDocs.map(doc => ({
                name: doc.originalname || doc.filename || 'Unknown',
                content: doc.pdfText || doc.content || '',
                score: bestScore,
                originalScore: bestScore,
                metadata: {
                  skills: doc.parsedCV?.Skills || doc.parsedCV?.skills || [],
                  experience: doc.parsedCV?.['Work Experience'] || doc.parsedCV?.experience || '',
                  role: doc.parsedCV?.Role || doc.parsedCV?.role || '',
                  pageNumber: 1,
                  chunk: 1
                }
              }));
            } catch (pdfError) {
              console.error('Error fetching PDF documents:', pdfError);
            }
          }
          
          return res.json({
            answer: bestMatch.answer,
            references,
            cached: true,
            queryAnalysis,
            searchStats: {
              totalFound: references.length,
              afterFiltering: references.length,
              finalResults: references.length,
              confidence: bestScore
            },
            suggestions: []
          });
        }
      }
    } catch (embeddingError) {
      console.error('Error processing embeddings:', embeddingError);
    }

    // Search Pinecone
    let topResults = [];
    let searchStats = {
      totalFound: 0,
      afterFiltering: 0,
      finalResults: 0,
      confidence: queryAnalysis.confidence
    };

    try {
      const index = await pineconeClient();
      const searchQuery = queryAnalysis.suggestedRewrite || query;
      
      console.log('Searching Pinecone with query:', searchQuery);
      
      // Get embeddings for search
      const queryEmbedding = await getEmbeddings([searchQuery]);
      
      if (!queryEmbedding || !queryEmbedding[0] || !queryEmbedding[0].embedding) {
        throw new Error('Failed to generate embeddings for search query');
      }
      
      const queryResponse = await index.namespace("default").query({
        vector: queryEmbedding[0].embedding,
        topK: 20,
        includeMetadata: true,
        includeValues: false
      });

      console.log('Pinecone search results:', queryResponse.matches.length);
      searchStats.totalFound = queryResponse.matches.length;

      // Process and filter results
      let candidates = queryResponse.matches
        .filter(match => match.score > 0.3) // Basic relevance threshold
        .map(match => ({
          ...match,
          metadata: match.metadata || {}
        }));

      searchStats.afterFiltering = candidates.length;

      // Apply smart filtering based on query analysis
      if (queryAnalysis.features.hasSkills.length > 0 || queryAnalysis.features.hasRole.length > 0) {
        const filterTerms = [
          ...queryAnalysis.features.hasSkills,
          ...queryAnalysis.features.hasRole
        ];
        
        candidates = candidates.filter(candidate => {
          const candidateText = JSON.stringify(candidate.metadata).toLowerCase();
          return filterTerms.some(term => candidateText.includes(term.toLowerCase()));
        });
      }

      // Rerank results
      const rerankedResults = await ResultReranker.rerank(
        candidates, 
        query, 
        userId, 
        queryAnalysis
      );

      topResults = rerankedResults.slice(0, 10);
      searchStats.finalResults = topResults.length;

      console.log('Final results after reranking:', topResults.length);

    } catch (searchError) {
      console.error('Error in Pinecone search:', searchError);
    }

    // Handle no results case
    if (!topResults.length) {
      const suggestions = await generateSearchSuggestions(query, userId);
      return res.json({
        answer: 'No relevant candidates found for your search. Try refining your query with more specific terms or check the suggestions below.',
        references: [],
        suggestions,
        queryAnalysis,
        searchStats
      });
    }

    // Generate enhanced response with context
    let responseContent = `Found ${topResults.length} candidates matching your search for "${query}".`;
    
    const isOllamaAvailable = await ollama.isAvailable();
    if (isOllamaAvailable) {
      try {
        const candidateData = topResults.slice(0, 5).map(result => ({
          name: result.metadata.name || 'Unknown',
          skills: result.metadata.skills || [],
          experience: result.metadata.experience || '',
          role: result.metadata.role || '',
          score: Math.round(result.finalScore * 100) / 100
        }));
        
        const prompt = `You are an expert resume search assistant. Based on the search results, provide a helpful summary.

Search Query: "${query}"
Enhanced Query: "${queryAnalysis.suggestedRewrite}"

Top Candidates:
${JSON.stringify(candidateData, null, 2)}

Provide a natural, helpful response (2-3 sentences) that:
1. Acknowledges the search and number of results
2. Highlights key skills/roles found
3. Mentions the quality of matches

Keep it concise and professional:`;

        const response = await ollama.generate(prompt);
        if (response && response.trim().length > 0) {
          responseContent = response.trim();
        }
      } catch (ollamaError) {
        console.error('Error generating response with Ollama:', ollamaError);
      }
    }
    
    // Store successful search in knowledge base
    try {
      const queryEmbedding = await getEmbeddings([query]);
      await QAKnowledgeBase.create({
        question: query,
        embedding: queryEmbedding[0].embedding,
        answer: responseContent,
        references: topResults.map(r => r.metadata.name || r.metadata.id).filter(Boolean),
        confidence: queryAnalysis.confidence,
        queryFeatures: queryAnalysis.features
      });
    } catch (kbError) {
      console.error('Error storing in knowledge base:', kbError);
    }

    // Log the query
    try {
      await QueryLog.create({
        query,
        rewrittenQuery: queryAnalysis.suggestedRewrite,
        results: topResults.map(r => r.metadata.name || r.metadata.id).filter(Boolean),
        user: userId,
        confidence: queryAnalysis.confidence,
        resultCount: topResults.length,
        timestamp: new Date()
      });
    } catch (logError) {
      console.error('Error logging query:', logError);
    }

    // Format final response
    const formattedReferences = topResults.map(result => ({
      name: result.metadata.name || result.metadata.filename || 'Unknown',
      content: result.metadata.text || result.metadata.content || '',
      score: result.finalScore || result.score || 0,
      originalScore: result.originalScore || result.score || 0,
      metadata: {
        pageNumber: result.metadata.pageNumber || 1,
        chunk: result.metadata.chunk || 1,
        skills: result.metadata.skills || [],
        experience: result.metadata.experience || '',
        role: result.metadata.role || ''
      }
    }));

    res.json({
      answer: responseContent,
      references: formattedReferences,
      queryAnalysis,
      searchStats,
      suggestions: []
    });

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ 
      message: 'Error processing search query', 
      error: error.message,
      references: [],
      queryAnalysis: {
        features: {
          hasName: false,
          hasSkills: [],
          hasRole: [],
          hasExperience: false,
          queryLength: 0,
          queryType: 'general'
        },
        suggestedRewrite: req.body.query || '',
        confidence: 0
      }
    });
  }
});

// Additional endpoints
router.get('/health', async (req, res) => {
  try {
    const isOllamaAvailable = await ollama.isAvailable();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ollama: {
        available: isOllamaAvailable,
        model: ollama.model || 'unknown',
        baseUrl: ollama.baseUrl || 'unknown'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { query, resultId, rating, interaction } = req.body;
    const userId = req.user?.id;
    
    if (!query || !resultId || !rating) {
      return res.status(400).json({ message: 'Query, resultId, and rating are required' });
    }
    
    await SearchFeedback.create({
      user: userId,
      query,
      resultId,
      rating,
      interaction: interaction || 'manual',
      timestamp: new Date()
    });
    
    res.json({ message: 'Feedback recorded successfully' });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ message: 'Error recording feedback', error: error.message });
  }
});

module.exports = router;