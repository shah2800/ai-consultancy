/** Shared pulse block for CRM loading skeletons (uses `.dashboard-skeleton-pulse` in App.css). */
export default function SkeletonPulse({ style }) {
  return <div className="dashboard-skeleton-pulse" aria-hidden style={style} />;
}
