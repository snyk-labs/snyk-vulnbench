import express from "express";
import BankStatementServiceClass from "../services/BankStatements.js"

const BankStatementService = new BankStatementServiceClass();
    
export const bankStatementsRouter = express.Router();

bankStatementsRouter.post("/bank_statements", async (req, res) => {
  const accountId = req.body.account_id;

  const data = await BankStatementService.GenerateAccountStatementPDF(accountId);
  return res.status(200).send({
    report_name: data.reportName,
  });
});

bankStatementsRouter.get("/bank_statements", async (req, res, next) => {
  let fileName = req.query.report_name;

  if (!fileName) {
    return res.status(400).send("Missing report_name parameter");
  }
  
  try {
    const fileContents = await BankStatementService.RetrieveAccountStatementPDF(fileName);
    res.setHeader("Content-Type", "application/pdf");
    res.send(fileContents);
    return;
  } catch (error) {
    console.error(error);
    return res.status(404).send("File not found");
  }
});