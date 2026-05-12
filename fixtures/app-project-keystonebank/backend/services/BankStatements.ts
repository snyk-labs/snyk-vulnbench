import { readFile } from "fs/promises";
import { setTimeout } from "timers/promises";
import path from "path";

const ASSETS_DIRECTORY = "../assets/statements";

export default class BankStatements {
  async RetrieveAccountStatementPDF(filename: string) {
    filename = decodeURIComponent(filename);
    filename = path.normalize(filename);

    const filePath = path.join(process.cwd(), ASSETS_DIRECTORY, filename);

    const fileContents = await readFile(filePath);

    return fileContents;
  }

  async GenerateAccountStatementPDF(
    accountId: string
  ): Promise<{ reportName: string }> {
    // mocked delay to simulate generating a PDF file
    await setTimeout(5000);
    return {
      reportName: "U1mGpsjXMA26.pdf",
    };
  }
}
