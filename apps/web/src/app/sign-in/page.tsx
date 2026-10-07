import SignInForm from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-start px-4 py-10 sm:px-6 sm:py-14">
      <div className="w-full max-w-md">
        <SignInForm />
      </div>
    </main>
  );
}
