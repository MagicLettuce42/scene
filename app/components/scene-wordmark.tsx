export default function SceneWordmark({ decorative = false }: { decorative?: boolean }) {
  return <span className="scene-brand-mark"><img className="scene-wordmark" src="/branding/scene-daylight-wordmark.webp?v=daylight-1" alt={decorative ? "" : "Scene"} width={2146} height={733} draggable={false} /></span>;
}
