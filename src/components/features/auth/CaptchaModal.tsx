// A self-contained mock "human verification" step — our own generic design,
// not a copy of any real CAPTCHA provider's UI or branding. Shown after
// Sign in / Sign up, before the action actually completes.

import { Check, Circle, Heart, RefreshCw, Square, Star, Triangle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";

interface ShapeDef {
  id: string;
  icon: LucideIcon;
  name: string;
}

const SHAPES: ShapeDef[] = [
  { id: "square", icon: Square, name: "square" },
  { id: "circle", icon: Circle, name: "circle" },
  { id: "triangle", icon: Triangle, name: "triangle" },
  { id: "star", icon: Star, name: "star" },
  { id: "heart", icon: Heart, name: "heart" },
];

const COLORS: { value: string; name: string }[] = [
  { value: "var(--color-primary-600)", name: "indigo" },
  { value: "var(--color-success-600)", name: "green" },
  { value: "var(--color-warning-600)", name: "amber" },
  { value: "var(--color-danger-600)", name: "rose" },
  { value: "var(--color-neutral-600)", name: "slate" },
];

interface Tile {
  id: string;
  shape: ShapeDef;
  color: { value: string; name: string };
}

interface Puzzle {
  target: ShapeDef;
  tiles: Tile[];
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function generatePuzzle(): Puzzle {
  const target = randomItem(SHAPES);
  let tiles: Tile[];
  do {
    tiles = Array.from({ length: 9 }, (_, i) => ({
      id: `${Date.now()}-${i}-${Math.random()}`,
      shape: randomItem(SHAPES),
      color: randomItem(COLORS),
    }));
  } while (
    !tiles.some((t) => t.shape.id === target.id) ||
    tiles.every((t) => t.shape.id === target.id)
  );
  return { target, tiles };
}

type Phase = "checkbox" | "puzzle" | "success";

export function CaptchaModal({
  isOpen,
  onClose,
  onVerified,
}: {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checkbox");
  const [puzzle, setPuzzle] = useState<Puzzle>(() => generatePuzzle());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRetry, setShowRetry] = useState(false);

  function reset() {
    setPhase("checkbox");
    setPuzzle(generatePuzzle());
    setSelected(new Set());
    setShowRetry(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function startPuzzle() {
    setPuzzle(generatePuzzle());
    setSelected(new Set());
    setShowRetry(false);
    setPhase("puzzle");
  }

  function toggleTile(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function newPuzzle() {
    setPuzzle(generatePuzzle());
    setSelected(new Set());
    setShowRetry(false);
  }

  function verify() {
    const correctIds = new Set(
      puzzle.tiles.filter((t) => t.shape.id === puzzle.target.id).map((t) => t.id),
    );
    const isCorrect =
      correctIds.size === selected.size && [...correctIds].every((id) => selected.has(id));

    if (isCorrect) {
      setPhase("success");
      setTimeout(() => {
        reset();
        onVerified();
      }, 700);
    } else {
      setShowRetry(true);
      setPuzzle(generatePuzzle());
      setSelected(new Set());
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Human verification">
      {phase === "checkbox" && (
        <label className="flex items-center gap-3 rounded-lg border border-neutral-300 p-4">
          <input
            type="checkbox"
            onChange={(e) => e.target.checked && startPuzzle()}
            className="h-5 w-5 rounded border-neutral-300 text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          />
          <span className="text-sm font-medium text-neutral-800">I'm not a robot</span>
        </label>
      )}

      {phase === "puzzle" && (
        <div>
          <p className="text-sm font-medium text-neutral-800">
            Select all the {puzzle.target.name}s
          </p>
          {showRetry && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger-600">
              Please try again.
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={`Select all the ${puzzle.target.name}s`}>
            {puzzle.tiles.map((tile) => {
              const isSelected = selected.has(tile.id);
              const Icon = tile.shape.icon;
              return (
                <button
                  key={tile.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${tile.color.name} ${tile.shape.name}`}
                  onClick={() => toggleTile(tile.id)}
                  className={`flex h-16 items-center justify-center rounded-lg border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                    isSelected ? "border-primary-600 bg-primary-50" : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <Icon className="h-7 w-7" style={{ color: tile.color.value }} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={newPuzzle}
              aria-label="Get a new puzzle"
              className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              New puzzle
            </button>
            <Button onClick={verify}>Verify</Button>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100 text-success-700">
            <Check className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-neutral-800">Verified</p>
        </div>
      )}
    </Modal>
  );
}
