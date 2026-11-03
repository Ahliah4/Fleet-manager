import Image from "next/image";

export function AuthBrand() {
  return (
    <div className="brand" aria-label="IP Motors Fleet Manager">
      <Image className="brand-mark" src="/brand-mark.svg" alt="" width={48} height={48} priority />
      <span className="brand-copy">
        <strong>IP Motors</strong>
        <span>Fleet Manager</span>
      </span>
    </div>
  );
}
