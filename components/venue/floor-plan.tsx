import Image from "next/image";
import floorPlan from "./floor-plan.png";

// thinkspace Seattle's bottom floor (level 1), cropped from the venue's plan, with the rooms that
// are closed to the hackathon (yellow on the original) marked over it. Used on /resources and in
// the kickoff deck (/slides). Positions are percentages of the image, so the marks scale with it.
export const OFF_LIMITS_ROOMS = [
  { name: "112", left: 5.9, top: 70.8, width: 14.1, height: 27 },
  { name: "113", left: 20.15, top: 70.8, width: 15.15, height: 11.8 },
  { name: "118", left: 22.75, top: 55.4, width: 8.85, height: 9.5 },
];

// "112, 113 and 118"
export const offLimitsList = OFF_LIMITS_ROOMS.map((room) => room.name)
  .join(", ")
  .replace(/, ([^,]*)$/, " and $1");

export const OFF_LIMITS_HATCH = "bg-[repeating-linear-gradient(135deg,rgba(191,95,63,0.55)_0_10px,rgba(191,95,63,0.25)_10px_20px)] ring-clay-deep";

// compactOnPhones: below the sm breakpoint the labels show only the room number, which is all
// that fits in the smaller rooms; the hatching and a legend say "off limits".
export function FloorPlan({
  className = "",
  labelClassName = "text-xs",
  ring = "ring-2",
  compactOnPhones = false,
}: {
  className?: string;
  labelClassName?: string;
  ring?: string;
  compactOnPhones?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-white ${className}`} style={{ aspectRatio: `${floorPlan.width} / ${floorPlan.height}` }}>
      <Image src={floorPlan} alt="thinkspace Seattle bottom floor (level 1) plan" className="h-full w-full object-contain" placeholder="blur" sizes="(min-width: 896px) 864px, 100vw" />
      {OFF_LIMITS_ROOMS.map((room) => (
        <div
          key={room.name}
          className={`absolute flex items-center justify-center ${OFF_LIMITS_HATCH} ${ring}`}
          style={{ left: `${room.left}%`, top: `${room.top}%`, width: `${room.width}%`, height: `${room.height}%` }}
        >
          <span className={`rounded bg-clay-deep px-1.5 py-0.5 text-center font-mono font-semibold uppercase leading-tight tracking-[0.06em] text-ivory ${labelClassName}`}>
            {room.name}
            <span className={compactOnPhones ? "hidden sm:inline" : undefined}>
              <br />
              Off limits
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
