// Check OpenRouter available models
async function getOpenRouterModels() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    const data = await response.json();
    
    console.log('OpenRouter Models with Video Support:');
    data.data.forEach(model => {
      // Check if model supports vision/video
      if (model.id.includes('gemini') || model.id.includes('vision') || 
          model.architecture?.modality === 'multimodal' ||
          model.id.includes('claude-3')) {
        console.log(`- ${model.id}: ${model.name}`);
        if (model.context_length) {
          console.log(`  Context: ${model.context_length} tokens`);
        }
      }
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

getOpenRouterModels();