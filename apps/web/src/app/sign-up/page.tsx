import SignUpForm from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <main className="flex w-full flex-1 justify-center bg-[#fbfaf6] px-5 py-10 text-[#24342b] sm:px-8 sm:py-16">
      <div className="h-fit w-full max-w-md rounded-2xl border border-[#ded9cf] bg-white p-6 shadow-[0_18px_50px_rgba(42,48,38,0.08)] sm:p-8">
        <SignUpForm />
      </div>
    </main>
  );
}
