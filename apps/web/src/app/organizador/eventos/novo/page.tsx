import { fetchCategories } from '@/lib/events-api';

import { NovoEventoForm } from './novo-evento-form';

async function NovoEventoPage() {
  const categories = await fetchCategories();

  return (
    <NovoEventoForm categories={categories.ok ? categories.categories : []} />
  );
}

export default NovoEventoPage;
