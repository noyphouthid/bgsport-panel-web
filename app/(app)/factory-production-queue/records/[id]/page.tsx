import { QueueRecordPage } from "../../_components/queue-record-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QueueRecordPage queueId={id} />;
}
