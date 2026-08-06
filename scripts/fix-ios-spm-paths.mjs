import { readFile, writeFile } from "node:fs/promises";

const packagePath = "ios/App/CapApp-SPM/Package.swift";
let source = await readFile(packagePath, "utf8");

source = source.replaceAll("\\", "/");

await writeFile(packagePath, source, "utf8");
console.log("iOS Swift Package paths normalized.");
