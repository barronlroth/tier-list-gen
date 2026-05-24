import { useDroppable } from "@dnd-kit/core";
import { DraggableTile } from "@/components/draggable-tile";
import type { BoardState } from "@/lib/types";

type BoardViewProps = {
  board: BoardState;
  onRetryImage: (itemId: string) => void;
};

export function BoardView({ board, onRetryImage }: BoardViewProps) {
  return (
    <>
      <div className="tiers">
        {board.tiers.map((tier) => (
          <div key={tier.id} className="tier-row">
            <div className={`tier-label ${tier.label.toLowerCase()}`}>
              {tier.label}
            </div>
            <DropZone id={tier.id} className="drop-zone">
              {tier.itemIds.map((itemId) => (
                <DraggableTile
                  key={itemId}
                  item={board.items[itemId]}
                  onRetryImage={onRetryImage}
                />
              ))}
            </DropZone>
          </div>
        ))}
      </div>
      <section className="tray">
        <h3>Tray</h3>
        <DropZone id="tray" className="drop-zone tray-zone">
          {board.trayItemIds.map((itemId) => (
            <DraggableTile
              key={itemId}
              item={board.items[itemId]}
              onRetryImage={onRetryImage}
            />
          ))}
        </DropZone>
      </section>
    </>
  );
}

function DropZone({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`${className}${isOver ? " is-over" : ""}`}>
      {children}
    </div>
  );
}
