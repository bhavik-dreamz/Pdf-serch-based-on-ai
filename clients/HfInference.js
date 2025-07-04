const { HfInference } = require("@huggingface/inference");

const Hfclient = ()=>{

    const client = new HfInference(process.env.HF_API_KEY);
    return client;
}

module.exports = Hfclient;
