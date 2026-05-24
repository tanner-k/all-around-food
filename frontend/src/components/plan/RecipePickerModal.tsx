"use client";

interface RecipeOption {
  id: string;
  title: string;
}

interface RecipePickerModalProps {
  recipes: RecipeOption[];
  onPick: (recipeId: string) => void;
  onClose: () => void;
}

export function RecipePickerModal({
  recipes,
  onPick,
  onClose,
}: RecipePickerModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl text-ink">
          Pick a <em className="italic text-terra">recipe</em>
        </h3>
        <p className="mb-4 mt-1 text-sm text-ink-mute">
          Choose a recipe from your cookbook.
        </p>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {recipes.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-mute">
              No saved recipes yet.
            </p>
          ) : (
            recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onPick(recipe.id)}
                className="flex w-full items-center border-b border-line py-2.5 text-left text-sm text-ink transition-colors last:border-b-0 hover:text-terra"
              >
                {recipe.title}
              </button>
            ))
          )}
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
