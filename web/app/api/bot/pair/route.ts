import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Numéro de téléphone requis.' },
        { status: 400 }
      );
    }

    const botApiUrl = process.env.BOT_API_URL || 'http://localhost:3001';

    const response = await fetch(`${botApiUrl}/api/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Erreur lors de la demande de jumelage.' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Erreur API /api/bot/pair :', err);
    return NextResponse.json(
      { error: err.message || 'Impossible de contacter le moteur WhatsApp.' },
      { status: 500 }
    );
  }
}
