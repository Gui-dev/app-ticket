import { Header } from '@/components/header';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const instant = false;

type RedefinirSenhaSearchParams = { token?: string | string[] };

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<RedefinirSenhaSearchParams>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <ResetPasswordForm token={typeof token === 'string' ? token : null} />
      </main>
    </>
  );
}
