import Link from "next/link";
import { QuillIcon } from "@/components/QuillIcon";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="bg-card rounded-card border border-card-border px-10 pt-10 pb-10 w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-paper rounded-control p-4 mb-4 border border-card-border">
            <QuillIcon className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">
            Blank page
          </h1>
          <p className="text-sm text-muted mt-2">
            There's nothing written here. The page you're looking for doesn't exist.
          </p>
        </div>

        <Link
          href="/feed"
          className="block w-full bg-accent text-card rounded-control py-2.5 text-sm font-semibold hover:bg-accent-hover transition-colors"
        >
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
