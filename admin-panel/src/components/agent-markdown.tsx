import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export function AgentMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 font-sans text-sm text-zinc-800 leading-relaxed overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ className, ...props }) => <h1 className={cn("mt-6 text-xl font-bold text-zinc-900 tracking-tight", className)} {...props} />,
          h2: ({ className, ...props }) => <h2 className={cn("mt-5 text-lg font-bold text-zinc-900 border-b border-zinc-100 pb-2 tracking-tight", className)} {...props} />,
          h3: ({ className, ...props }) => <h3 className={cn("mt-4 text-base font-semibold text-zinc-900 tracking-tight", className)} {...props} />,
          h4: ({ className, ...props }) => <h4 className={cn("mt-3 text-sm font-semibold text-zinc-900 uppercase tracking-widest text-zinc-500", className)} {...props} />,
          p: ({ className, ...props }) => <p className={cn("leading-relaxed", className)} {...props} />,
          ul: ({ className, ...props }) => <ul className={cn("list-disc pl-5 mt-2 space-y-1.5 marker:text-zinc-400", className)} {...props} />,
          ol: ({ className, ...props }) => <ol className={cn("list-decimal pl-5 mt-2 space-y-1.5 marker:text-zinc-400", className)} {...props} />,
          li: ({ className, ...props }) => <li className={cn("leading-relaxed", className)} {...props} />,
          code: ({ className, ...props }) => <code className={cn("rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-tight text-zinc-800", className)} {...props} />,
          pre: ({ className, ...props }) => <pre className={cn("rounded-lg bg-zinc-50/80 p-3 overflow-x-auto text-[11px] mt-3 border border-zinc-200/80 shadow-sm custom-scrollbar", className)} {...props} />,
          table: ({ className, ...props }) => (
            <div className="overflow-x-auto mt-4 mb-5 rounded-xl border border-zinc-200/80 shadow-sm bg-white">
              <table className={cn("w-full text-left text-[13px]", className)} {...props} />
            </div>
          ),
          thead: ({ className, ...props }) => <thead className={cn("bg-zinc-50 border-b border-zinc-200/80 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold", className)} {...props} />,
          tr: ({ className, ...props }) => <tr className={cn("border-b border-zinc-100 last:border-0", className)} {...props} />,
          th: ({ className, ...props }) => <th className={cn("px-4 py-2.5 font-semibold text-zinc-700", className)} {...props} />,
          td: ({ className, ...props }) => <td className={cn("px-4 py-2.5 leading-relaxed text-zinc-700", className)} {...props} />,
          a: ({ className, ...props }) => <a className={cn("font-medium text-sky-600 underline underline-offset-4 hover:text-sky-800 transition-colors", className)} {...props} />,
          strong: ({ className, ...props }) => <strong className={cn("font-semibold text-zinc-900", className)} {...props} />,
          hr: ({ className, ...props }) => <hr className={cn("my-6 border-zinc-200/80", className)} {...props} />,
          blockquote: ({ className, ...props }) => <blockquote className={cn("border-l-4 border-zinc-200 pl-4 py-1 italic text-zinc-600 bg-zinc-50/50 rounded-r-lg my-3", className)} {...props} />
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
