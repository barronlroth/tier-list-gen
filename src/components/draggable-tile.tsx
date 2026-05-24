import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BoardItem } from "@/lib/types";

type DraggableTileProps = {
  item: BoardItem;
  onRetryImage: (itemId: string) => void;
};

export function DraggableTile({ item, onRetryImage }: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`tile${isDragging ? " is-dragging" : ""}`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...listeners}
      {...attributes}
    >
      <div className="tile-image">
        {item.status === "ready" && item.imageUrl ? (
          <img alt="" src={item.imageUrl} draggable={false} />
        ) : item.status === "failed" ? (
          <div className="tile-actions">
            <span className="tile-placeholder">image failed</span>
            <button
              className="retry-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRetryImage(item.id);
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <span className="tile-placeholder">generating</span>
        )}
      </div>
      <div className="tile-title">{item.title}</div>
    </div>
  );
}

