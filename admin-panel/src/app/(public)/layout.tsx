export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent">
      <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[520px] min-w-0">{children}</div>
      </div>
    </div>
  )
}
