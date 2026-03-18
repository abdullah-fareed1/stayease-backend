import admin from '../config/firebase';

export const sendToOne = async (token: string, title: string, body: string): Promise<void> => {
  try {
    await admin.messaging().send({ token, notification: { title, body } });
  } catch (err) {
    console.error('[FCM] sendToOne failed:', err);
  }
};

export const sendToMany = async (tokens: string[], title: string, body: string): Promise<{ successCount: number; failureCount: number }> => {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };
  try {
    const res = await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body } });
    return { successCount: res.successCount, failureCount: res.failureCount };
  } catch (err) {
    console.error('[FCM] sendToMany failed:', err);
    return { successCount: 0, failureCount: tokens.length };
  }
};