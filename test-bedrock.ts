import 'dotenv/config'
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

async function main() {
  try {
    const command = new ConverseCommand({
      // For Sydney (ap-southeast-2), use the APAC profile or on-demand Nova Lite ID:
      modelId: 'apac.anthropic.claude-opus-4-6-v1',
      messages: [
        {
          role: 'user',
          content: [{ text: "Say 'Bedrock is ready to build!'" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.7,
      },
    })

    const response = await client.send(command)
    const reply = response.output?.message?.content?.[0]?.text

    console.log('Success:', reply)
  } catch (error: any) {
    // Fallback if cross-region APAC profile isn't active on your account yet
    if (error.name === 'ValidationException') {
      console.log('Retrying with standard on-demand ID...')
      tryFallback()
      return
    }
    console.error('Connection failed:', error)
  }
}

async function tryFallback() {
  try {
    const fallbackCommand = new ConverseCommand({
      modelId: 'amazon.nova-lite-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: "Say 'Bedrock is ready to build!'" }],
        },
      ],
    })
    const response = await client.send(fallbackCommand)
    console.log('Success:', response.output?.message?.content?.[0]?.text)
  } catch (err) {
    console.error('Fallback failed:', err)
  }
}

main()
