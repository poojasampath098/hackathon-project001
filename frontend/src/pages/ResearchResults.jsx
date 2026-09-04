import { useState } from "react";
import { Search, Bell, SearchX, Loader2 } from "lucide-react";
import Badge from "../components/ui/Badge";
import { aiApi } from "../services/ai.api";

export default function ResearchResults() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runResearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiApi.research(q);
      setResult(res?.data?.response || "");
    } catch (err) {
      setResult(null);
      setError(err.message || "Research failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full min-h-screen bg-transparent px-6 lg:px-8 py-6 flex flex-col gap-6">
      {/* Top Navbar */}
        <div className="flex items-center justify-end gap-4">
          <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
            <Search className="w-4 h-4 text-gray-500" />
          </button>
          <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out relative">
            <Bell className="w-4 h-4 text-gray-500" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <button className="p-2 rounded-lg border border-transparent hover:bg-purple-50/50 hover:border-purple-100 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.35)] transition-all duration-200 ease-out">
            <span className="flex w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Research Results</h1>
          {result !== null && (
            <Badge variant="purple">Completed</Badge>
          )}
        </div>

        <form onSubmit={runResearch} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a research query..."
            className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-purple-300 transition"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-900 to-purple-600 hover:opacity-95 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-8px_rgba(147,51,234,0.45)] active:scale-95 transition-all duration-200 ease-out disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Research
          </button>
        </form>

        {error && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center border border-red-100">
            <SearchX className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {result !== null && !error && (
          <div className="bg-white rounded-xl shadow-sm p-6 hover:-translate-y-0.5 hover:scale-[1.005] hover:shadow-[0_12px_30px_-12px_rgba(147,51,234,0.25)] transition-all duration-200 ease-out">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="purple">Query</Badge>
              <p className="text-sm font-semibold text-gray-900">{query}</p>
            </div>
            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
              {result || "No results returned."}
            </pre>
          </div>
        )}
    </main>
  );
}