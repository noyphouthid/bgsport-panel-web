import { QueueDetailPage } from "../_components/queue-detail-page";

type FactoryProductionQueueDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FactoryProductionQueueDetailPage({ params }: FactoryProductionQueueDetailPageProps) {
  const { id } = await params;
  return <QueueDetailPage queueId={id} detailMode="pattern" />;
}
