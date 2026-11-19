"use client";

import { useI18n } from "./i18n";
import type { KeyboardEvent } from "react";

/**
 * The video's title in the top bar: one line, cut with an ellipsis when it is long, with the little "i" always in view.
 * Tapping it (a full 44px target) opens the video's details, where the whole title is written out.
 */
export function TopbarTitle({ title, detail, onOpen }: { title: string; detail: string; onOpen?: () => void }) {
  const { t } = useI18n();

  const open = onOpen && {
    role: "button" as const, tabIndex: 0, "aria-haspopup": "dialog" as const, "aria-label": t("topbar.showDetails", { title }),
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } },
  };

  return (
    <div className="topbar-title" data-interactive={!!onOpen} {...open}>
      <div className="title-row">
        <strong className="title-text" title={title}>{title}</strong>
        {onOpen && <i className="title-info" aria-hidden="true">i</i>}
      </div>
      <span title={detail}>{detail}</span>
    </div>
  );
}
