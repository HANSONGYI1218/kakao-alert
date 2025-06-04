import Image from "next/image";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-black px-20 py-6 text-white transition duration-700">
      <Image src="/logo.svg" width={200} height={100} alt="logo" />
      {/* <Button>로그인</Button> */}
    </header>
  );
}
