import type { CSSProperties } from "react";
import styles from "./thinking-dots.module.css";

// A decorative mark for the header: three terracotta dots orbiting in 3D, like Claude thinking.
export function ThinkingDots() {
  return (
    <span className={styles.root} aria-hidden="true">
      <span className={styles.tilt}>
        <span className={styles.spin}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.place} style={{ "--angle": `${i * 120}deg` } as CSSProperties}>
              <span className={styles.unspin}>
                <span className={styles.untilt}>
                  <span className={styles.dot} style={{ "--phase": i / 3 } as CSSProperties} />
                </span>
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
