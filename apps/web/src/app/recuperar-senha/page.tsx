import { Header } from '@/components/header';
import { RecoverPasswordForm } from '@/components/recover-password-form';

export const instant = false;

export default function RecuperarSenhaPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <RecoverPasswordForm />
      </main>
    </>
  );
}
