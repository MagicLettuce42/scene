export default function SceneWordmark({ decorative = false }: { decorative?: boolean }) {
  return <span className="scene-brand-mark"><img className="scene-wordmark" src="/icons/scene-wordmark-sidelight.webp?v=sidelight-1" alt={decorative ? "" : "Scene"} width={1440} height={384} draggable={false} /></span>;
}
