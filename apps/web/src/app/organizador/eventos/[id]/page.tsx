import { fetchCategories } from '@/lib/events-api';

import { EventoEditor } from './evento-editor';

type EventoEditorPageProps = {
  params: Promise<{ id: string }>;
};

async function EventoEditorPage({ params }: EventoEditorPageProps) {
  const { id } = await params;
  const categories = await fetchCategories();

  return (
    <EventoEditor
      eventId={id}
      categories={categories.ok ? categories.categories : []}
    />
  );
}

export default EventoEditorPage;
