const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
//const pincode = require('./pinccode')

// Load environment variables
dotenv.config();

// Import routes
const pdfRoutes = require('./routes/pdfRoutes');
const chatRoutes = require('./routes/chatRoutes');
const  mongoClient = require('./clients/mongo');
//const { pineconeClient } = require('./clients/pinecone');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Set up routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/chat', chatRoutes);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}



// Initialize services
const initializeServices = async () => {
  try {
    await mongoClient.connect();
    // Test Pinecone connection
    //const pc = pineconeClient(); 
   
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error);
    process.exit(1);
  }
};

// Default route
app.get('/', (req, res) => {
  res.send('PDF Chat API is running');
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await initializeServices();
});