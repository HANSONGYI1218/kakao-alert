import { Button } from "../ui/button";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex w-full text-white bg-black items-center transition duration-700 px-20 justify-between py-6">
      <img
        src="/logo.svg"
        width={200}
        height={100}
        alt="logo"
      />
      <Button>로그인</Button>
    </header>
  );
}
