'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

export async function updateOnboardingStatus(status: OnboardingStatus) {
  const response = await keystoneClient(
    `mutation UpdateOnboardingStatus($data: UserUpdateProfileInput!) { updateActiveUser(data: $data) { id onboardingStatus } }`,
    { data: { onboardingStatus: status } }
  );
  if (!response.success || response.data?.updateActiveUser?.onboardingStatus !== status) {
    return { success: false as const, error: response.success ? 'Setup status was not saved.' : response.error };
  }
  revalidatePath('/dashboard', 'layout');
  return { success: true as const };
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed');
}

export type OnboardingAnswersInput = {
  companyName: string;
  country: 'US' | 'KE' | 'IN' | 'PK';
  sells: string[];
  instalments: boolean;
  paymentMethods: string[];
};

export type OnboardingResult =
  | { success: true; created: Record<string, number>; staffPassword: string | null; customerLogin: { email: string; password: string } | null }
  | { success: false; error: string };

/**
 * Runs the real `runBiogasOnboarding` mutation as the signed-in owner. The key is made once per dialog, so a
 * retry after a dropped connection replays the first result instead of loading twice.
 */
export async function runOnboarding(answers: OnboardingAnswersInput, idempotencyKey: string): Promise<OnboardingResult> {
  const response = await keystoneClient(
    `mutation RunBiogasOnboarding($answers: JSON!, $idempotencyKey: String!) { runBiogasOnboarding(answers: $answers, idempotencyKey: $idempotencyKey) }`,
    { answers, idempotencyKey }
  );
  if (!response.success) return { success: false, error: response.error };
  const r = response.data?.runBiogasOnboarding;
  if (!r?.created) return { success: false, error: 'Setup did not return a result.' };
  revalidatePath('/dashboard', 'layout');
  return { success: true, created: r.created, staffPassword: r.staffPassword ?? null, customerLogin: r.customerLogin ?? null };
}
