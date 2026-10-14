import { Header } from '@/components/header';
import { LoginForm } from '@/components/login-form';

export const instant = false;

export default function EntrarPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 sm:px-6 lg:px-8">
        <LoginForm />
      </main>
    </>
  );
}
