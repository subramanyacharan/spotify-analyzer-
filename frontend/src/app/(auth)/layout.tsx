export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-auto bg-[#0d0d0d] text-zinc-100">
      {children}
    </div>
  );
}
