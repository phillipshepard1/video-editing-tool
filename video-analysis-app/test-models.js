// Quick test to check available Gemini models
const API_KEY = 'AIzaSyDaIgw7bCy6uaM2K7TRX9HWx56gt0XOxy0';

async function listModels() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );
    const data = await response.json();
    
    console.log('Available Gemini Models:');
    data.models.forEach(model => {
      if (model.supportedGenerationMethods.includes('generateContent')) {
        console.log(`- ${model.name} (${model.displayName})`);
      }
    });
  } catch (error) {
    console.error('Error fetching models:', error);
  }
}

listModels();