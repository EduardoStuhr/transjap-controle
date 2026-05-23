import { readFile, writeFile } from "node:fs/promises";

const packagePath = "ios/App/CapApp-SPM/Package.swift";
let source = await readFile(packagePath, "utf8");

source = source
  .replaceAll("..\\..\\..\\node_modules\\@capacitor\\app", "../../../node_modules/@capacitor/app")
  .replaceAll("..\\..\\..\\node_modules\\@capacitor\\keyboard", "../../../node_modules/@capacitor/keyboard")
  .replaceAll("..\\..\\..\\node_modules\\@capacitor\\network", "../../../node_modules/@capacitor/network")
  .replaceAll(
    "..\\..\\..\\node_modules\\@capacitor\\splash-screen",
    "../../../node_modules/@capacitor/splash-screen",
  )
  .replaceAll(
    "..\\..\\..\\node_modules\\@capacitor\\status-bar",
    "../../../node_modules/@capacitor/status-bar",
  );

await writeFile(packagePath, source, "utf8");
console.log("iOS Swift Package paths normalized.");
