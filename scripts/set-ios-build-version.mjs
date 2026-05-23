import { readFile, writeFile } from "node:fs/promises";

const projectPath = "ios/App/App.xcodeproj/project.pbxproj";
const packagePath = "package.json";

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const marketingVersion = process.env.IOS_VERSION ?? packageJson.version ?? "1.0.0";
const buildNumber =
  process.env.IOS_BUILD_NUMBER ??
  process.env.CI_BUILD_NUMBER ??
  new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const teamId = process.env.APPLE_TEAM_ID ?? "XXXXXXXXXX";

let project = await readFile(projectPath, "utf8");
project = project
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketingVersion};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);

if (project.includes("DEVELOPMENT_TEAM =")) {
  project = project.replace(/DEVELOPMENT_TEAM = [^;]+;/g, `DEVELOPMENT_TEAM = ${teamId};`);
} else {
  project = project.replace(/CODE_SIGN_STYLE = Automatic;/g, `CODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = ${teamId};`);
}

await writeFile(projectPath, project, "utf8");
console.log(`iOS version set to ${marketingVersion} (${buildNumber}); team ${teamId}.`);
