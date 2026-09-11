import { NextResponse } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type DocumentFormat,
  type ImageFormat,
} from '@aws-sdk/client-bedrock-runtime';

import { z } from 'zod';

export const maxDuration = 60;

const client = new BedrockRuntimeClient({
  region: process.env.APP_AWS_REGION || 'ap-southeast-2',
  ...(process.env.APP_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  }),
});

const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';

const ExtractedInvoiceSchema = z.object({
  vendorName: z.string(),
  invoiceNumber: z.string(),
  date: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      hours: z.number(),
      rate: z.number(),
    }),
  ),
});

const DOCUMENT_FORMATS: Record<string, DocumentFormat> = {
  'application/pdf': 'pdf',
};

const IMAGE_FORMATS: Record<string, ImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

const SYSTEM_PROMPT = `You are a document extraction engine. Extract invoice data from the provided document and return ONLY valid JSON matching this exact schema:

{
  "vendorName": "string",
  "invoiceNumber": "string",
  "date": "YYYY-MM-DD",
  "lineItems": [
    { "description": "string", "hours": number, "rate": number }
  ]
}

Rules:
- Extract ONLY what is explicitly stated in the document.
- If the document lists "quantity" or "qty" instead of hours, use that value as hours.
- If rate is not listed but total and hours/quantity are, calculate rate = total / hours.
- If hours are not discernible, default to 1.
- Date must be in YYYY-MM-DD format. If ambiguous, assume US date format (MM/DD/YYYY).
- Return ONLY the raw JSON object. No markdown fences, no explanation, no extra text.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileBase64, mimeType, fileName } = body as {
      fileBase64: string;
      mimeType: string;
      fileName: string;
    };

    if (!fileBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'fileBase64 and mimeType are required.' },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(fileBase64, 'base64');

    let contentBlock: ContentBlock;
    const docFormat = DOCUMENT_FORMATS[mimeType];
    const imgFormat = IMAGE_FORMATS[mimeType];

    if (docFormat) {
      contentBlock = {
        document: {
          format: docFormat,
          name: fileName?.replace(/\.[^.]+$/, '') || 'invoice',
          source: { bytes },
        },
      };
    } else if (imgFormat) {
      contentBlock = {
        image: {
          format: imgFormat,
          source: { bytes },
        },
      };
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Use PDF, PNG, or JPEG.` },
        { status: 400 },
      );
    }

    const command = new ConverseCommand({
      modelId,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { text: 'Extract the invoice data from this document.' },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.1,
      },
    });

    const response = await client.send(command);

    const outputText =
      response.output?.message?.content?.[0]?.text ?? '';

    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Model did not return valid JSON.', raw: outputText },
        { status: 422 },
      );
    }

    const parsed = ExtractedInvoiceSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Extracted data does not match invoice schema.', details: parsed.error.issues, raw: outputText },
        { status: 422 },
      );
    }

    return NextResponse.json({ success: true, invoice: parsed.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[extract] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
