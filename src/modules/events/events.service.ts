import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { In, Repository } from "typeorm";
import { EventEntity } from "../../entities/event.entity";
import { EventParticipantEntity } from "../../entities/event-participant.entity";
import { EventPledgeEntity } from "../../entities/event-pledge.entity";
import { MemberEntity } from "../../entities/member.entity";
import { UserEntity } from "../../entities/user.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { LifeGroupMemberEntity } from "../../entities/lifegroup-member.entity";
import { getChurchDisplayName } from "../../utils/church-display";
import { loadPastorChurchesByMemberId, resolveMemberChurchId } from "../../utils/member-church";

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(EventParticipantEntity) private readonly participantsRepo: Repository<EventParticipantEntity>,
    @InjectRepository(EventPledgeEntity) private readonly pledgesRepo: Repository<EventPledgeEntity>,
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>,
    @InjectRepository(LifeGroupMemberEntity) private readonly lifeGroupMembersRepo: Repository<LifeGroupMemberEntity>
  ) {}

  private async resolveUserName(userId: number | null) {
    if (!userId) return "-";
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    return user?.fullName || "-";
  }

  private normalizeEventTime(value: string | null | undefined) {
    if (!value) return value as string;
    const trimmed = String(value).trim();
    const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (match12) {
      return `${String(Number(match12[1])).padStart(2, "0")}:${match12[2]} ${match12[3].toLowerCase()}`;
    }
    const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      let hours = Number(match24[1]);
      const minutes = match24[2];
      const period = hours >= 12 ? "pm" : "am";
      hours %= 12;
      if (hours === 0) hours = 12;
      return `${String(hours).padStart(2, "0")}:${minutes} ${period}`;
    }
    return trimmed;
  }

  private getRegistrationStatus(event: EventEntity) {
    if (event.status !== "published") {
      return { registrationOpen: false, registrationClosedReason: "Registration is only available for published events." };
    }
    if (event.eventDate) {
      const today = new Date().toISOString().slice(0, 10);
      const eventDate =
        typeof event.eventDate === "string"
          ? event.eventDate.slice(0, 10)
          : new Date(event.eventDate).toISOString().slice(0, 10);
      if (eventDate < today) {
        return { registrationOpen: false, registrationClosedReason: "Registration is closed because the event date has passed." };
      }
    }
    return { registrationOpen: true, registrationClosedReason: null };
  }

  private mapEvent(row: EventEntity, extras: Record<string, unknown> = {}) {
    const registration = this.getRegistrationStatus(row);
    return {
      id: row.id,
      name: row.name,
      eventDate: row.eventDate,
      eventTime: this.normalizeEventTime(row.eventTime),
      location: row.location,
      description: row.description,
      expectedParticipants: row.expectedParticipants,
      registrationFee: row.registrationFee ? Number(row.registrationFee) : 0,
      status: row.status,
      eventType: row.eventType,
      tags: row.tags,
      organizer: row.organizer,
      contactPerson: row.contactPerson,
      contactEmail: row.contactEmail,
      allowPledges: row.allowPledges,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      registrationOpen: registration.registrationOpen,
      registrationClosedReason: registration.registrationClosedReason,
      ...extras
    };
  }

  private mapParticipant(
    row: EventParticipantEntity,
    extras: {
      firstName?: string | null;
      lastName?: string | null;
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      churchId?: number | null;
      lifegroupId?: number | null;
      churchName?: string | null;
      lifegroupName?: string | null;
    } = {}
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      memberId: row.memberId,
      firstName: extras.firstName ?? null,
      lastName: extras.lastName ?? null,
      fullName: extras.fullName ?? row.fullName,
      churchId: extras.churchId ?? null,
      lifegroupId: extras.lifegroupId ?? null,
      churchName: extras.churchName ?? null,
      lifegroupName: extras.lifegroupName ?? null,
      email: extras.email ?? row.email,
      phone: extras.phone ?? row.phone,
      qrToken: row.qrToken,
      attendedAt: row.attendedAt,
      registrationPaid: row.registrationPaid,
      registrationAmount: row.registrationAmount ? Number(row.registrationAmount) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async enrichParticipants(rows: EventParticipantEntity[]) {
    const memberIds = [...new Set(rows.map((r) => r.memberId).filter(Boolean) as number[])];
    const members = memberIds.length ? await this.membersRepo.find({ where: { id: In(memberIds) } }) : [];
    const memberById = new Map(members.map((m) => [m.id, m]));

    const links = memberIds.length
      ? await this.lifeGroupMembersRepo.find({ where: { memberId: In(memberIds) } })
      : [];
    const linkedLifegroupIds = [...new Set(links.map((link) => link.lifeGroupId))];
    const linkedLifegroups = linkedLifegroupIds.length
      ? await this.lifeGroupsRepo.find({ where: { id: In(linkedLifegroupIds) } })
      : [];
    const coachLifegroups = memberIds.length
      ? await this.lifeGroupsRepo.find({ where: { coachMemberId: In(memberIds) } })
      : [];
    const pastorChurchByMemberId = await loadPastorChurchesByMemberId(this.churchesRepo, memberIds);

    const lifegroupById = new Map<number, LifeGroupEntity>();
    [...linkedLifegroups, ...coachLifegroups].forEach((group) => lifegroupById.set(group.id, group));

    const churchIds = [
      ...new Set(
        [
          ...linkedLifegroups.map((group) => group.churchId),
          ...coachLifegroups.map((group) => group.churchId),
          ...members.map((member) => member.churchId),
          ...[...pastorChurchByMemberId.values()].map((church) => church.id)
        ].filter(Boolean) as number[]
      )
    ];
    const churches = churchIds.length ? await this.churchesRepo.find({ where: { id: In(churchIds) } }) : [];
    const churchNameById = new Map(churches.map((church) => [church.id, getChurchDisplayName(church)]));

    const lifegroupByMemberId = new Map<number, LifeGroupEntity>();
    for (const link of links) {
      if (!lifegroupByMemberId.has(link.memberId)) {
        const lifegroup = lifegroupById.get(link.lifeGroupId);
        if (lifegroup) lifegroupByMemberId.set(link.memberId, lifegroup);
      }
    }
    for (const group of coachLifegroups) {
      if (!lifegroupByMemberId.has(group.coachMemberId)) {
        lifegroupByMemberId.set(group.coachMemberId, group);
      }
    }

    return rows.map((row) => {
      const member = row.memberId ? memberById.get(row.memberId) : null;
      const lifegroup = row.memberId ? lifegroupByMemberId.get(row.memberId) : null;
      const churchId = member
        ? resolveMemberChurchId(member, pastorChurchByMemberId) ?? lifegroup?.churchId ?? null
        : null;

      return {
        ...this.mapParticipant(row, {
          firstName: member?.firstName ?? null,
          lastName: member?.lastName ?? null,
          fullName: member ? `${member.firstName} ${member.lastName}` : row.fullName,
          email: member?.email ?? row.email,
          phone: member?.phone ?? row.phone,
          churchId,
          lifegroupId: lifegroup?.id ?? null,
          churchName: churchId ? churchNameById.get(churchId) || null : null,
          lifegroupName: lifegroup?.name ?? null
        }),
        memberLinked: !!row.memberId
      };
    });
  }

  private async assertRegistrationOpen(event: EventEntity) {
    const status = this.getRegistrationStatus(event);
    if (!status.registrationOpen) {
      throw new BadRequestException(status.registrationClosedReason || "Registration is not open.");
    }
  }

  private async validateChurchAndLifeGroup(churchId: number, lifegroupId: number | null) {
    const church = await this.churchesRepo.findOne({ where: { id: churchId } });
    if (!church) throw new NotFoundException("Church not found");

    if (!lifegroupId) return;

    const lifegroup = await this.lifeGroupsRepo.findOne({ where: { id: lifegroupId } });
    if (!lifegroup) throw new NotFoundException("LifeGroup not found");
    if (lifegroup.churchId && lifegroup.churchId !== churchId) {
      throw new BadRequestException("Selected LifeGroup does not belong to the selected church.");
    }
  }

  private buildParticipantName(body: any, fallbackFullName?: string | null) {
    const firstName = body.firstName?.trim() || null;
    const lastName = body.lastName?.trim() || null;
    const fullName =
      body.fullName?.trim() ||
      (firstName && lastName ? `${firstName} ${lastName}` : null) ||
      fallbackFullName ||
      null;
    return { firstName, lastName, fullName };
  }

  private async findMemberByName(firstName: string, lastName: string) {
    return this.membersRepo
      .createQueryBuilder("member")
      .where("LOWER(member.firstName) = LOWER(:firstName)", { firstName: firstName.trim() })
      .andWhere("LOWER(member.lastName) = LOWER(:lastName)", { lastName: lastName.trim() })
      .getOne();
  }

  private async ensureLifegroupMembership(memberId: number, lifegroupId: number | null) {
    if (!lifegroupId) return;

    const existing = await this.lifeGroupMembersRepo.findOne({
      where: { lifeGroupId: lifegroupId, memberId }
    });
    if (existing) return;

    await this.lifeGroupMembersRepo.save(
      this.lifeGroupMembersRepo.create({
        lifeGroupId: lifegroupId,
        memberId,
        parentMemberId: null
      })
    );
  }

  private async resolveMemberForRegistration(
    firstName: string,
    lastName: string,
    lifegroupId: number | null,
    churchId: number | null = null
  ) {
    let member = await this.findMemberByName(firstName, lastName);
    let isNewMember = false;

    if (!member) {
      member = await this.membersRepo.save(
        this.membersRepo.create({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: null,
          phone: null,
          gender: "",
          churchId
        })
      );
      isNewMember = true;
    } else if (churchId) {
      await this.membersRepo.update(member.id, { churchId });
      member = { ...member, churchId };
    }

    await this.ensureLifegroupMembership(member.id, lifegroupId);
    return { member, isNewMember };
  }

  private async assertNotAlreadyRegistered(eventId: number, memberId: number) {
    const existing = await this.participantsRepo.findOne({ where: { eventId, memberId } });
    if (existing) {
      throw new BadRequestException("You are already registered for this event.");
    }
  }

  private async createEventParticipant(event: EventEntity, member: MemberEntity) {
    const saved = await this.participantsRepo.save(
      this.participantsRepo.create({
        eventId: event.id,
        memberId: member.id,
        fullName: `${member.firstName} ${member.lastName}`,
        email: member.email,
        phone: member.phone,
        qrToken: randomUUID().replace(/-/g, ""),
        registrationPaid: false,
        registrationAmount: event.registrationFee && Number(event.registrationFee) > 0 ? event.registrationFee : null
      })
    );
    const [participant] = await this.enrichParticipants([saved]);
    return participant;
  }

  private mapPledge(row: EventPledgeEntity) {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      pledgerName: row.pledgerName,
      email: row.email,
      amount: Number(row.amount),
      paid: row.paid,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async getEventOrFail(id: number) {
    const row = await this.eventsRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Event not found");
    return row;
  }

  private validateEventBody(body: any, isCreate = false) {
    if (isCreate && !body?.name) throw new BadRequestException("Event name is required");
    if (isCreate && !body?.eventTime) throw new BadRequestException("Event time is required");
    if (isCreate && !body?.location) throw new BadRequestException("Event location is required");
    if (isCreate && !body?.description) throw new BadRequestException("Event description is required");
  }

  private buildEventPayload(body: any, existing?: EventEntity) {
    return {
      name: body.name ?? existing?.name,
      eventDate: body.eventDate !== undefined ? body.eventDate || null : existing?.eventDate ?? null,
      eventTime: this.normalizeEventTime(body.eventTime ?? existing?.eventTime),
      location: body.location ?? existing?.location,
      description: body.description ?? existing?.description,
      expectedParticipants:
        body.expectedParticipants !== undefined
          ? body.expectedParticipants ? Number(body.expectedParticipants) : null
          : existing?.expectedParticipants ?? null,
      registrationFee:
        body.registrationFee !== undefined
          ? body.registrationFee ? String(body.registrationFee) : "0"
          : existing?.registrationFee ?? "0",
      status: body.status ?? existing?.status ?? "draft",
      eventType: body.eventType ?? existing?.eventType ?? "internal",
      tags: body.tags !== undefined ? body.tags || null : existing?.tags ?? null,
      organizer: body.organizer !== undefined ? body.organizer || null : existing?.organizer ?? null,
      contactPerson: body.contactPerson !== undefined ? body.contactPerson || null : existing?.contactPerson ?? null,
      contactEmail: body.contactEmail !== undefined ? body.contactEmail || null : existing?.contactEmail ?? null,
      allowPledges: body.allowPledges !== undefined ? !!body.allowPledges : existing?.allowPledges ?? false,
      createdBy: existing?.createdBy ?? (body.createdBy ? Number(body.createdBy) : null),
      updatedBy: body.updatedBy ? Number(body.updatedBy) : existing?.updatedBy ?? null
    };
  }

  async add(body: any) {
    this.validateEventBody(body, true);
    const saved = await this.eventsRepo.save(this.eventsRepo.create(this.buildEventPayload(body)));
    return this.view(saved.id);
  }

  async list() {
    const rows = await this.eventsRepo.find({ order: { id: "DESC" } });
    const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy].filter(Boolean) as number[]))];
    const users = userIds.length ? await this.usersRepo.find({ where: { id: In(userIds) } }) : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return Promise.all(
      rows.map(async (row) => {
        const participantCount = await this.participantsRepo.count({ where: { eventId: row.id } });
        return this.mapEvent(row, {
          participantCount,
          createdByName: row.createdBy ? nameById.get(row.createdBy) || "-" : "-",
          updatedByName: row.updatedBy ? nameById.get(row.updatedBy) || "-" : "-"
        });
      })
    );
  }

  async view(id: number) {
    const row = await this.getEventOrFail(id);
    const createdByName = await this.resolveUserName(row.createdBy);
    const updatedByName = await this.resolveUserName(row.updatedBy);
    const participantCount = await this.participantsRepo.count({ where: { eventId: id } });
    return this.mapEvent(row, { participantCount, createdByName, updatedByName });
  }

  async edit(id: number, body: any) {
    const existing = await this.getEventOrFail(id);
    this.validateEventBody({ ...existing, ...body });
    await this.eventsRepo.update(id, this.buildEventPayload(body, existing));
    return this.view(id);
  }

  async remove(id: number) {
    await this.getEventOrFail(id);
    await this.pledgesRepo.delete({ eventId: id });
    await this.participantsRepo.delete({ eventId: id });
    await this.eventsRepo.delete(id);
    return { id, deleted: true };
  }

  async listParticipants(eventId: number) {
    await this.getEventOrFail(eventId);
    const rows = await this.participantsRepo.find({ where: { eventId }, order: { id: "ASC" } });
    return this.enrichParticipants(rows);
  }

  async addParticipant(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    const churchId = body.churchId ? Number(body.churchId) : null;
    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;
    let member: MemberEntity | null = null;

    if (body.memberId) {
      member = await this.membersRepo.findOne({ where: { id: Number(body.memberId) } });
      if (!member) throw new NotFoundException("Member not found");
      await this.ensureLifegroupMembership(member.id, lifegroupId);
      if (churchId) {
        await this.membersRepo.update(member.id, { churchId });
        member = { ...member, churchId };
      }
    } else {
      const name = this.buildParticipantName(body);
      if (!name.firstName || !name.lastName) {
        throw new BadRequestException("Participant first name and last name are required");
      }
      const resolved = await this.resolveMemberForRegistration(name.firstName, name.lastName, lifegroupId, churchId);
      member = resolved.member;
    }

    if (churchId) await this.validateChurchAndLifeGroup(churchId, lifegroupId);
    await this.assertNotAlreadyRegistered(eventId, member.id);

    return this.createEventParticipant(event, member);
  }

  async editParticipant(eventId: number, participantId: number, body: any) {
    await this.getEventOrFail(eventId);
    const existing = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!existing) throw new NotFoundException("Participant not found");

    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;
    let memberId =
      body.memberId !== undefined ? (body.memberId ? Number(body.memberId) : null) : existing.memberId;

    if (body.memberId) {
      const member = await this.membersRepo.findOne({ where: { id: memberId! } });
      if (!member) throw new NotFoundException("Member not found");
      await this.ensureLifegroupMembership(member.id, lifegroupId);
    } else {
      const name = this.buildParticipantName(body, existing.fullName);
      if (name.firstName && name.lastName) {
        const resolved = await this.resolveMemberForRegistration(name.firstName, name.lastName, lifegroupId);
        memberId = resolved.member.id;
      } else if (existing.memberId && lifegroupId) {
        await this.ensureLifegroupMembership(existing.memberId, lifegroupId);
      }
    }

    const member = memberId ? await this.membersRepo.findOne({ where: { id: memberId } }) : null;
    const fullName = member ? `${member.firstName} ${member.lastName}` : body.fullName?.trim() || existing.fullName;

    await this.participantsRepo.update(participantId, {
      memberId,
      fullName,
      email: body.email !== undefined ? body.email || null : member?.email ?? existing.email,
      phone: body.phone !== undefined ? body.phone || null : member?.phone ?? existing.phone
    });

    const updated = await this.participantsRepo.findOne({ where: { id: participantId } });
    const [participant] = await this.enrichParticipants([updated!]);
    return participant;
  }

  async removeParticipant(eventId: number, participantId: number) {
    await this.getEventOrFail(eventId);
    const existing = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!existing) throw new NotFoundException("Participant not found");
    await this.participantsRepo.delete(participantId);
    return { id: participantId, deleted: true };
  }

  async checkIn(eventId: number, body: any) {
    await this.getEventOrFail(eventId);
    const participantId = Number(body.participantId);
    const token = body.token?.trim();

    if (!participantId || !token) throw new BadRequestException("Invalid check-in payload");

    const participant = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!participant) throw new NotFoundException("Participant not found");
    if (participant.qrToken !== token) throw new BadRequestException("Invalid QR token");
    if (participant.attendedAt) {
      return { ...this.mapParticipant(participant), alreadyCheckedIn: true };
    }

    await this.participantsRepo.update(participantId, { attendedAt: new Date() });
    const updated = await this.participantsRepo.findOne({ where: { id: participantId } });
    return { ...this.mapParticipant(updated!), alreadyCheckedIn: false };
  }

  async payRegistration(eventId: number, participantId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    const fee = Number(event.registrationFee || 0);
    if (fee <= 0) throw new BadRequestException("This event has no registration fee");

    const participant = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!participant) throw new NotFoundException("Participant not found");

    const amount = body.amount !== undefined ? Number(body.amount) : fee;
    await this.participantsRepo.update(participantId, {
      registrationPaid: true,
      registrationAmount: String(amount)
    });

    const updated = await this.participantsRepo.findOne({ where: { id: participantId } });
    return this.mapParticipant(updated!);
  }

  async listPledges(eventId: number) {
    await this.getEventOrFail(eventId);
    const rows = await this.pledgesRepo.find({ where: { eventId }, order: { id: "DESC" } });
    return rows.map((r) => this.mapPledge(r));
  }

  async addPledge(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    if (!event.allowPledges) throw new BadRequestException("Pledges are not enabled for this event");
    if (!body.pledgerName?.trim()) throw new BadRequestException("Pledger name is required");
    if (!body.amount || Number(body.amount) <= 0) throw new BadRequestException("Pledge amount must be greater than zero");

    const saved = await this.pledgesRepo.save(
      this.pledgesRepo.create({
        eventId,
        participantId: body.participantId ? Number(body.participantId) : null,
        pledgerName: body.pledgerName.trim(),
        email: body.email?.trim() || null,
        amount: String(body.amount),
        paid: !!body.paid
      })
    );
    return this.mapPledge(saved);
  }

  async editPledge(eventId: number, pledgeId: number, body: any) {
    await this.getEventOrFail(eventId);
    const existing = await this.pledgesRepo.findOne({ where: { id: pledgeId, eventId } });
    if (!existing) throw new NotFoundException("Pledge not found");

    await this.pledgesRepo.update(pledgeId, {
      pledgerName: body.pledgerName ?? existing.pledgerName,
      email: body.email !== undefined ? body.email || null : existing.email,
      amount: body.amount !== undefined ? String(body.amount) : existing.amount,
      paid: body.paid !== undefined ? !!body.paid : existing.paid,
      participantId:
        body.participantId !== undefined
          ? body.participantId
            ? Number(body.participantId)
            : null
          : existing.participantId
    });

    const updated = await this.pledgesRepo.findOne({ where: { id: pledgeId } });
    return this.mapPledge(updated!);
  }

  async removePledge(eventId: number, pledgeId: number) {
    await this.getEventOrFail(eventId);
    const existing = await this.pledgesRepo.findOne({ where: { id: pledgeId, eventId } });
    if (!existing) throw new NotFoundException("Pledge not found");
    await this.pledgesRepo.delete(pledgeId);
    return { id: pledgeId, deleted: true };
  }

  async dashboard(eventId: number) {
    const event = await this.view(eventId);
    const participants = await this.listParticipants(eventId);
    const pledges = event.allowPledges ? await this.listPledges(eventId) : [];

    const attendedCount = participants.filter((p) => p.attendedAt).length;
    const registrationCollected = participants
      .filter((p) => p.registrationPaid)
      .reduce((sum, p) => sum + (p.registrationAmount || 0), 0);
    const pledgesCollected = pledges.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0);
    const pledgesTotal = pledges.reduce((sum, p) => sum + p.amount, 0);

    return {
      event,
      participants,
      pledges,
      stats: {
        participantCount: participants.length,
        expectedParticipants: event.expectedParticipants || 0,
        attendedCount,
        attendanceRate: participants.length ? Math.round((attendedCount / participants.length) * 100) : 0,
        registrationCollected,
        pledgesCollected,
        pledgesTotal,
        totalCollected: registrationCollected + pledgesCollected
      }
    };
  }

  async getSignupInfo(eventId: number) {
    const event = await this.getEventOrFail(eventId);
    const registration = this.getRegistrationStatus(event);
    return {
      event: this.mapEvent(event),
      ...registration
    };
  }

  async publicSignup(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    await this.assertRegistrationOpen(event);

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const churchId = body.churchId ? Number(body.churchId) : null;
    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;

    if (!firstName) throw new BadRequestException("First name is required");
    if (!lastName) throw new BadRequestException("Last name is required");
    if (!churchId) throw new BadRequestException("Church is required");

    await this.validateChurchAndLifeGroup(churchId, lifegroupId);

    const { member } = await this.resolveMemberForRegistration(firstName, lastName, lifegroupId, churchId);
    await this.assertNotAlreadyRegistered(eventId, member.id);

    const participant = await this.createEventParticipant(event, member);
    const paymentRequired = Number(event.registrationFee || 0) > 0;

    return {
      participant,
      paymentRequired,
      paymentUrl: paymentRequired ? `/events/${eventId}/register/${participant.id}` : null,
      message: "You have successfully registered to the event."
    };
  }
}
