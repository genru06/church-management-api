import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { OperationsService } from "./operations.service";

@Controller("operations")
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get("summary")
  summary() {
    return this.operationsService.summary();
  }

  @Get("event-pledges")
  listEventPledges() {
    return this.operationsService.listEventPledges();
  }

  @Get("registration-fees")
  listRegistrationFees() {
    return this.operationsService.listRegistrationFees();
  }

  @Get("tithes")
  listTithes() {
    return this.operationsService.listTithes();
  }

  @Get("tithes/:id")
  viewTithe(@Param("id") id: string) {
    return this.operationsService.viewTithe(Number(id));
  }

  @Post("tithes")
  addTithe(@Body() body: any) {
    return this.operationsService.addTithe(body);
  }

  @Put("tithes/:id")
  editTithe(@Param("id") id: string, @Body() body: any) {
    return this.operationsService.editTithe(Number(id), body);
  }

  @Delete("tithes/:id")
  removeTithe(@Param("id") id: string) {
    return this.operationsService.removeTithe(Number(id));
  }

  @Get("offerings")
  listOfferings() {
    return this.operationsService.listOfferings();
  }

  @Get("offerings/:id")
  viewOffering(@Param("id") id: string) {
    return this.operationsService.viewOffering(Number(id));
  }

  @Post("offerings")
  addOffering(@Body() body: any) {
    return this.operationsService.addOffering(body);
  }

  @Put("offerings/:id")
  editOffering(@Param("id") id: string, @Body() body: any) {
    return this.operationsService.editOffering(Number(id), body);
  }

  @Delete("offerings/:id")
  removeOffering(@Param("id") id: string) {
    return this.operationsService.removeOffering(Number(id));
  }

  @Get("expenses")
  listExpenses() {
    return this.operationsService.listExpenses();
  }

  @Get("expenses/:id")
  viewExpense(@Param("id") id: string) {
    return this.operationsService.viewExpense(Number(id));
  }

  @Post("expenses")
  addExpense(@Body() body: any) {
    return this.operationsService.addExpense(body);
  }

  @Put("expenses/:id")
  editExpense(@Param("id") id: string, @Body() body: any) {
    return this.operationsService.editExpense(Number(id), body);
  }

  @Delete("expenses/:id")
  removeExpense(@Param("id") id: string) {
    return this.operationsService.removeExpense(Number(id));
  }

  @Get("vouchers")
  listVouchers() {
    return this.operationsService.listVouchers();
  }

  @Get("vouchers/:id")
  viewVoucher(@Param("id") id: string) {
    return this.operationsService.viewVoucher(Number(id));
  }

  @Post("vouchers")
  addVoucher(@Body() body: any) {
    return this.operationsService.addVoucher(body);
  }

  @Put("vouchers/:id")
  editVoucher(@Param("id") id: string, @Body() body: any) {
    return this.operationsService.editVoucher(Number(id), body);
  }

  @Delete("vouchers/:id")
  removeVoucher(@Param("id") id: string) {
    return this.operationsService.removeVoucher(Number(id));
  }
}
