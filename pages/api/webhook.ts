// pages/api/webhook.ts

import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false, // 👈 반드시 false여야 Stripe 서명이 유효함
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  let event: Stripe.Event;

  try {
    const rawBody = await buffer(req);
    const sig = req.headers['stripe-signature'] as string;

    // 👇 Stripe 이벤트 검증
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ 이벤트 핸들링
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      console.log('✅ 결제 완료!');
      console.log('고객 이메일:', session.customer_details?.email);
      console.log('총 결제 금액:', session.amount_total);
      console.log('세션 ID:', session.id);

      // 🔧 여기에 원하는 후처리 로직 추가
      // - 주문 DB 저장
      // - 이메일 발송
      // - 배송 요청
      // 예시: await saveOrderToDatabase(session);

      break;
    }

    default:
      console.log(`ℹ️Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
}
