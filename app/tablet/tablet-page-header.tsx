/**
 * TabletPageHeader — shared header component for all tablet pages.
 * Matches the exact same name-display style as the Profile page:
 *   SECTION LABEL (uppercase, muted)
 *   Athlete Name  (32px, weight 800)
 *   subtitle      (17px, muted)
 *
 * The ThemeToggleButton (client component) is slotted in on the right side.
 * Only the Today page passes it; other pages leave the right side empty.
 */
import type { ReactNode } from "react";

export function TabletPageHeader({
  section,
  name,
  subtitle,
  right,
}: {
  section: string;
  name: string | null;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      flexShrink: 0,
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "28px 40px 22px",
      background: "var(--m-card)",
      borderBottom: "1px solid var(--m-border)",
    }}>
      {/* Left: label + name + subtitle */}
      <div>
        <div style={{
          fontSize: 15, fontWeight: 600, color: "var(--m-muted)",
          textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4,
        }}>
          {section}
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, color: "var(--m-text)",
          letterSpacing: "-.4px", lineHeight: 1.1,
        }}>
          {name ?? "Athlete"}
        </div>
        {subtitle && (
          <div style={{ fontSize: 17, color: "var(--m-muted)", marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Right: optional slot (theme toggle, brand logo, etc.) */}
      {right && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, paddingTop: 4 }}>
          {right}
        </div>
      )}
    </div>
  );
}
