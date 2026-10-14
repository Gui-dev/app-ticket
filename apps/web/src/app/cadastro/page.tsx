import { Header } from '@/components/header';
import { SignupForm } from '@/components/signup-form';

export const instant = false;

export default function CadastroPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <SignupForm />
      </main>
    </>
  );
}
