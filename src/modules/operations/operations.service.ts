import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TitheEntity } from "../../entities/tithe.entity";
import { OfferingEntity } from "../../entities/offering.entity";
import { ExpenseEntity } from "../../entities/expense.entity";
import { VoucherEntity } from "../../entities/voucher.entity";
import { EventEntity } from "../../entities/event.entity";
import { EventParticipantEntity } from "../../entities/event-participant.entity";
import { EventPledgeEntity } from "../../entities/event-pledge.entity";

const BILL_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1] as const;

@Injectable()
export class OperationsService {
  constructor(
    @InjectRepository(TitheEntity) private readonly tithesRepo: Repository<TitheEntity>,
    @InjectRepository(OfferingEntity) private readonly offeringsRepo: Repository<OfferingEntity>,
    @InjectRepository(ExpenseEntity) private readonly expensesRepo: Repository<ExpenseEntity>,
    @InjectRepository(VoucherEntity) private readonly vouchersRepo: Repository<VoucherEntity>,
    @InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(EventParticipantEntity) private readonly participantsRepo: Repository<EventParticipantEntity>,
    @InjectRepository(EventPledgeEntity) private readonly pledgesRepo: Repository<EventPledgeEntity>
  ) {}

  private computeBillTotal(body: any) {
    return BILL_DENOMINATIONS.reduce((sum, denom) => {
      const key = `bill${denom}`;
      return sum + (Number(body[key]) || 0) * denom;
    }, 0);
  }

  private extractBills(body: any) {
    const bills: Record<string, number> = {};
    for (const denom of BILL_DENOMINATIONS) {
      bills[`bill${denom}`] = Math.max(0, Number(body[`bill${denom}`]) || 0);
    }
    return bills;
  }

  private mapCashCount(row: TitheEntity | OfferingEntity) {
    return {
      id: row.id,
      recordDate: row.recordDate,
      bill1000: row.bill1000,
      bill500: row.bill500,
      bill200: row.bill200,
      bill100: row.bill100,
      bill50: row.bill50,
      bill20: row.bill20,
      bill10: row.bill10,
      bill5: row.bill5,
      bill1: row.bill1,
      totalAmount: Number(row.totalAmount),
      countedBy: row.countedBy,
      checkedBy: row.checkedBy,
      remarks: row.remarks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private mapExpense(row: ExpenseEntity) {
    return {
      id: row.id,
      expenseDate: row.expenseDate,
      category: row.category,
      payee: row.payee,
      amount: Number(row.amount),
      description: row.description,
      approvedBy: row.approvedBy,
      remarks: row.remarks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private mapVoucher(row: VoucherEntity) {
    return {
      id: row.id,
      voucherNo: row.voucherNo,
      voucherDate: row.voucherDate,
      payee: row.payee,
      amount: Number(row.amount),
      purpose: row.purpose,
      status: row.status,
      remarks: row.remarks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private validateCashCountBody(body: any) {
    if (!body.recordDate) throw new BadRequestException("Date is required");
    if (!body.countedBy?.trim()) throw new BadRequestException("Counted by is required");
    if (!body.checkedBy?.trim()) throw new BadRequestException("Checked by is required");
    const total = this.computeBillTotal(body);
    if (total <= 0) throw new BadRequestException("Total amount must be greater than zero");
    return total;
  }

  private buildCashCountPayload(body: any, total: number) {
    return {
      recordDate: body.recordDate,
      ...this.extractBills(body),
      totalAmount: String(total),
      countedBy: body.countedBy.trim(),
      checkedBy: body.checkedBy.trim(),
      remarks: body.remarks?.trim() || null
    };
  }

  async summary() {
    const [tithes, offerings, expenses, vouchers, pledges, participants] = await Promise.all([
      this.tithesRepo.find(),
      this.offeringsRepo.find(),
      this.expensesRepo.find(),
      this.vouchersRepo.find(),
      this.pledgesRepo.find(),
      this.participantsRepo.find({ where: { registrationPaid: true } })
    ]);

    const tithesTotal = tithes.reduce((sum, r) => sum + Number(r.totalAmount), 0);
    const offeringsTotal = offerings.reduce((sum, r) => sum + Number(r.totalAmount), 0);
    const expensesTotal = expenses.reduce((sum, r) => sum + Number(r.amount), 0);
    const vouchersTotal = vouchers
      .filter((r) => r.status !== "cancelled")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const pledgesTotal = pledges.reduce((sum, r) => sum + Number(r.amount), 0);
    const pledgesPaid = pledges.filter((r) => r.paid).reduce((sum, r) => sum + Number(r.amount), 0);
    const registrationTotal = participants.reduce((sum, r) => sum + Number(r.registrationAmount || 0), 0);

    return {
      tithesTotal,
      offeringsTotal,
      expensesTotal,
      vouchersTotal,
      pledgesTotal,
      pledgesPaid,
      registrationTotal,
      incomeTotal: tithesTotal + offeringsTotal + pledgesPaid + registrationTotal,
      netBalance: tithesTotal + offeringsTotal + pledgesPaid + registrationTotal - expensesTotal
    };
  }

  // Tithes
  async listTithes() {
    const rows = await this.tithesRepo.find({ order: { recordDate: "DESC", id: "DESC" } });
    return rows.map((r) => this.mapCashCount(r));
  }

  async viewTithe(id: number) {
    const row = await this.tithesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Tithe record not found");
    return this.mapCashCount(row);
  }

  async addTithe(body: any) {
    const total = this.validateCashCountBody(body);
    const saved = await this.tithesRepo.save(this.tithesRepo.create(this.buildCashCountPayload(body, total)));
    return this.mapCashCount(saved);
  }

  async editTithe(id: number, body: any) {
    const existing = await this.tithesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Tithe record not found");

    const merged = {
      bill1000: body.bill1000 ?? existing.bill1000,
      bill500: body.bill500 ?? existing.bill500,
      bill200: body.bill200 ?? existing.bill200,
      bill100: body.bill100 ?? existing.bill100,
      bill50: body.bill50 ?? existing.bill50,
      bill20: body.bill20 ?? existing.bill20,
      bill10: body.bill10 ?? existing.bill10,
      bill5: body.bill5 ?? existing.bill5,
      bill1: body.bill1 ?? existing.bill1,
      recordDate: body.recordDate ?? existing.recordDate,
      countedBy: body.countedBy ?? existing.countedBy,
      checkedBy: body.checkedBy ?? existing.checkedBy,
      remarks: body.remarks !== undefined ? body.remarks || null : existing.remarks
    };

    const total = this.computeBillTotal(merged);
    if (total <= 0) throw new BadRequestException("Total amount must be greater than zero");

    await this.tithesRepo.update(id, {
      ...merged,
      totalAmount: String(total),
      countedBy: merged.countedBy.trim(),
      checkedBy: merged.checkedBy.trim()
    });

    return this.viewTithe(id);
  }

  async removeTithe(id: number) {
    const existing = await this.tithesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Tithe record not found");
    await this.tithesRepo.delete(id);
    return { id, deleted: true };
  }

  // Offerings
  async listOfferings() {
    const rows = await this.offeringsRepo.find({ order: { recordDate: "DESC", id: "DESC" } });
    return rows.map((r) => this.mapCashCount(r));
  }

  async viewOffering(id: number) {
    const row = await this.offeringsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Offering record not found");
    return this.mapCashCount(row);
  }

  async addOffering(body: any) {
    const total = this.validateCashCountBody(body);
    const saved = await this.offeringsRepo.save(this.offeringsRepo.create(this.buildCashCountPayload(body, total)));
    return this.mapCashCount(saved);
  }

  async editOffering(id: number, body: any) {
    const existing = await this.offeringsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Offering record not found");

    const merged = {
      bill1000: body.bill1000 ?? existing.bill1000,
      bill500: body.bill500 ?? existing.bill500,
      bill200: body.bill200 ?? existing.bill200,
      bill100: body.bill100 ?? existing.bill100,
      bill50: body.bill50 ?? existing.bill50,
      bill20: body.bill20 ?? existing.bill20,
      bill10: body.bill10 ?? existing.bill10,
      bill5: body.bill5 ?? existing.bill5,
      bill1: body.bill1 ?? existing.bill1,
      recordDate: body.recordDate ?? existing.recordDate,
      countedBy: body.countedBy ?? existing.countedBy,
      checkedBy: body.checkedBy ?? existing.checkedBy,
      remarks: body.remarks !== undefined ? body.remarks || null : existing.remarks
    };

    const total = this.computeBillTotal(merged);
    if (total <= 0) throw new BadRequestException("Total amount must be greater than zero");

    await this.offeringsRepo.update(id, {
      ...merged,
      totalAmount: String(total),
      countedBy: merged.countedBy.trim(),
      checkedBy: merged.checkedBy.trim()
    });

    return this.viewOffering(id);
  }

  async removeOffering(id: number) {
    const existing = await this.offeringsRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Offering record not found");
    await this.offeringsRepo.delete(id);
    return { id, deleted: true };
  }

  // Expenses
  async listExpenses() {
    const rows = await this.expensesRepo.find({ order: { expenseDate: "DESC", id: "DESC" } });
    return rows.map((r) => this.mapExpense(r));
  }

  async viewExpense(id: number) {
    const row = await this.expensesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Expense not found");
    return this.mapExpense(row);
  }

  async addExpense(body: any) {
    if (!body.expenseDate) throw new BadRequestException("Date is required");
    if (!body.category?.trim()) throw new BadRequestException("Category is required");
    if (!body.payee?.trim()) throw new BadRequestException("Payee is required");
    if (!body.amount || Number(body.amount) <= 0) throw new BadRequestException("Amount must be greater than zero");

    const saved = await this.expensesRepo.save(
      this.expensesRepo.create({
        expenseDate: body.expenseDate,
        category: body.category.trim(),
        payee: body.payee.trim(),
        amount: String(body.amount),
        description: body.description?.trim() || null,
        approvedBy: body.approvedBy?.trim() || null,
        remarks: body.remarks?.trim() || null
      })
    );
    return this.mapExpense(saved);
  }

  async editExpense(id: number, body: any) {
    const existing = await this.expensesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");

    await this.expensesRepo.update(id, {
      expenseDate: body.expenseDate ?? existing.expenseDate,
      category: body.category?.trim() ?? existing.category,
      payee: body.payee?.trim() ?? existing.payee,
      amount: body.amount !== undefined ? String(body.amount) : existing.amount,
      description: body.description !== undefined ? body.description || null : existing.description,
      approvedBy: body.approvedBy !== undefined ? body.approvedBy || null : existing.approvedBy,
      remarks: body.remarks !== undefined ? body.remarks || null : existing.remarks
    });

    return this.viewExpense(id);
  }

  async removeExpense(id: number) {
    const existing = await this.expensesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Expense not found");
    await this.expensesRepo.delete(id);
    return { id, deleted: true };
  }

  // Vouchers
  async listVouchers() {
    const rows = await this.vouchersRepo.find({ order: { voucherDate: "DESC", id: "DESC" } });
    return rows.map((r) => this.mapVoucher(r));
  }

  async viewVoucher(id: number) {
    const row = await this.vouchersRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Voucher not found");
    return this.mapVoucher(row);
  }

  async addVoucher(body: any) {
    if (!body.voucherNo?.trim()) throw new BadRequestException("Voucher number is required");
    if (!body.voucherDate) throw new BadRequestException("Date is required");
    if (!body.payee?.trim()) throw new BadRequestException("Payee is required");
    if (!body.purpose?.trim()) throw new BadRequestException("Purpose is required");
    if (!body.amount || Number(body.amount) <= 0) throw new BadRequestException("Amount must be greater than zero");

    const saved = await this.vouchersRepo.save(
      this.vouchersRepo.create({
        voucherNo: body.voucherNo.trim(),
        voucherDate: body.voucherDate,
        payee: body.payee.trim(),
        amount: String(body.amount),
        purpose: body.purpose.trim(),
        status: body.status || "draft",
        remarks: body.remarks?.trim() || null
      })
    );
    return this.mapVoucher(saved);
  }

  async editVoucher(id: number, body: any) {
    const existing = await this.vouchersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Voucher not found");

    await this.vouchersRepo.update(id, {
      voucherNo: body.voucherNo?.trim() ?? existing.voucherNo,
      voucherDate: body.voucherDate ?? existing.voucherDate,
      payee: body.payee?.trim() ?? existing.payee,
      amount: body.amount !== undefined ? String(body.amount) : existing.amount,
      purpose: body.purpose?.trim() ?? existing.purpose,
      status: body.status ?? existing.status,
      remarks: body.remarks !== undefined ? body.remarks || null : existing.remarks
    });

    return this.viewVoucher(id);
  }

  async removeVoucher(id: number) {
    const existing = await this.vouchersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Voucher not found");
    await this.vouchersRepo.delete(id);
    return { id, deleted: true };
  }

  // Event pledges (read-only aggregate)
  async listEventPledges() {
    const pledges = await this.pledgesRepo.find({ order: { id: "DESC" } });
    const events = await this.eventsRepo.find();
    const eventMap = new Map(events.map((e) => [e.id, e]));

    return pledges.map((p) => ({
      id: p.id,
      eventId: p.eventId,
      eventName: eventMap.get(p.eventId)?.name || "Unknown event",
      pledgerName: p.pledgerName,
      email: p.email,
      amount: Number(p.amount),
      paid: p.paid,
      createdAt: p.createdAt
    }));
  }

  // Registration fees (read-only aggregate)
  async listRegistrationFees() {
    const participants = await this.participantsRepo.find({ order: { id: "DESC" } });
    const events = await this.eventsRepo.find();
    const eventMap = new Map(events.map((e) => [e.id, e]));

    return participants
      .filter((p) => p.registrationPaid)
      .map((p) => ({
        id: p.id,
        eventId: p.eventId,
        eventName: eventMap.get(p.eventId)?.name || "Unknown event",
        participantName: p.fullName,
        email: p.email,
        amount: Number(p.registrationAmount || 0),
        paidAt: p.updatedAt
      }));
  }
}
