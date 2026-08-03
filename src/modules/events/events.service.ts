import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { EventEntity } from "../../entities/event.entity";
import { EventParticipantEntity } from "../../entities/event-participant.entity";
import { EventPledgeEntity } from "../../entities/event-pledge.entity";
import { EventReservationEntity } from "../../entities/event-reservation.entity";
import { MemberEntity } from "../../entities/member.entity";
import { UserEntity } from "../../entities/user.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { LifeGroupMemberEntity } from "../../entities/lifegroup-member.entity";
import { MemberTagEntity } from "../../entities/member-tag.entity";
import { TagEntity } from "../../entities/tag.entity";
import { getChurchDisplayName, sortChurchesMainFirst } from "../../utils/church-display";
import { loadPastorChurchesByMemberId, resolveMemberChurchId } from "../../utils/member-church";
import { generateQrToken } from "../../utils/qr-token";

export const EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE_V2 = "LIFEGROUP_EVENT_PARTICIPANT_BULK_V2";
export const EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE_V3 = "LIFEGROUP_EVENT_PARTICIPANT_BULK_V3";
export const EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE = "LIFEGROUP_EVENT_PARTICIPANT_BULK_V4";

const VALID_EVENT_PARTICIPANT_BULK_SIGNATURES = new Set([
  EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE_V2,
  EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE_V3,
  EVENT_PARTICIPANT_BULK_TEMPLATE_SIGNATURE
]);

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(EventParticipantEntity) private readonly participantsRepo: Repository<EventParticipantEntity>,
    @InjectRepository(EventPledgeEntity) private readonly pledgesRepo: Repository<EventPledgeEntity>,
    @InjectRepository(EventReservationEntity)
    private readonly reservationsRepo: Repository<EventReservationEntity>,
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>,
    @InjectRepository(LifeGroupMemberEntity) private readonly lifeGroupMembersRepo: Repository<LifeGroupMemberEntity>,
    @InjectRepository(MemberTagEntity) private readonly memberTagsRepo: Repository<MemberTagEntity>,
    @InjectRepository(TagEntity) private readonly tagsRepo: Repository<TagEntity>
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
      reservedParticipants: row.reservedParticipants != null ? Number(row.reservedParticipants) : 0,
      registrationFee: row.registrationFee ? Number(row.registrationFee) : 0,
      status: row.status,
      eventType: row.eventType,
      tags: row.tags,
      organizer: row.organizer,
      contactPerson: row.contactPerson,
      contactEmail: row.contactEmail,
      allowPledges: row.allowPledges,
      requiresPreRegistration: row.requiresPreRegistration,
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
      reservationId?: number | null;
      reservationLabel?: string | null;
      memberQrToken?: string | null;
    } = {}
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      memberId: row.memberId,
      reservationId: extras.reservationId ?? row.reservationId ?? null,
      reservationLabel: extras.reservationLabel ?? null,
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
      memberQrToken: extras.memberQrToken ?? null,
      attendedAt: row.attendedAt,
      registrationPaid: row.registrationPaid,
      registrationAmount: row.registrationAmount ? Number(row.registrationAmount) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async loadMemberTagsByMemberId(memberIds: number[]) {
    const map = new Map<number, string[]>();
    if (!memberIds.length) return map;

    const memberTags = await this.memberTagsRepo.find({ where: { memberId: In(memberIds) } });
    if (!memberTags.length) return map;

    const tagIds = [...new Set(memberTags.map((row) => Number(row.tagId)))];
    const tags = tagIds.length ? await this.tagsRepo.find({ where: { id: In(tagIds) } }) : [];
    const tagNameById = new Map(tags.map((tag) => [Number(tag.id), tag.name]));

    for (const row of memberTags) {
      const memberId = Number(row.memberId);
      const tagName = tagNameById.get(Number(row.tagId));
      if (!tagName) continue;
      const existing = map.get(memberId) || [];
      existing.push(tagName);
      map.set(memberId, existing);
    }

    return map;
  }

  private isKidsTagged(tags: string[] = []) {
    return tags.some((tag) => String(tag || "").trim().toLowerCase() === "kids");
  }

  private async enrichParticipants(rows: EventParticipantEntity[]) {
    const memberIds = [...new Set(rows.map((r) => r.memberId).filter(Boolean) as number[])];
    const members = memberIds.length ? await this.membersRepo.find({ where: { id: In(memberIds) } }) : [];
    const memberById = new Map(members.map((m) => [Number(m.id), m]));
    const tagsByMemberId = await this.loadMemberTagsByMemberId(memberIds);

    const reservationIds = [...new Set(rows.map((r) => r.reservationId).filter(Boolean) as number[])];
    const reservations = reservationIds.length
      ? await this.reservationsRepo.find({ where: { id: In(reservationIds) } })
      : [];
    const reservationById = new Map(reservations.map((r) => [Number(r.id), r]));

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

    return rows
      .map((row) => {
        const member = row.memberId ? memberById.get(Number(row.memberId)) : null;
        const lifegroup = row.memberId ? lifegroupByMemberId.get(Number(row.memberId)) : null;
        const churchId = member
          ? resolveMemberChurchId(member, pastorChurchByMemberId) ?? lifegroup?.churchId ?? null
          : null;
        const tags = row.memberId ? tagsByMemberId.get(Number(row.memberId)) || [] : [];
        const isKid = this.isKidsTagged(tags);
        const reservation = row.reservationId ? reservationById.get(Number(row.reservationId)) : null;
        const guestNameParts =
          !member && row.fullName
            ? String(row.fullName)
                .trim()
                .split(/\s+/)
                .filter(Boolean)
            : [];

        return {
          ...this.mapParticipant(row, {
            firstName: member?.firstName ?? (guestNameParts.length > 1 ? guestNameParts[0] : null),
            lastName:
              member?.lastName ??
              (guestNameParts.length > 1
                ? guestNameParts.slice(1).join(" ")
                : guestNameParts[0] || null),
            fullName: member ? `${member.firstName} ${member.lastName}` : row.fullName,
            email: member?.email ?? row.email,
            phone: member?.phone ?? row.phone,
            churchId,
            lifegroupId: lifegroup?.id ?? null,
            churchName: churchId ? churchNameById.get(churchId) || null : null,
            lifegroupName: lifegroup?.name ?? null,
            reservationId: reservation?.id ?? row.reservationId ?? null,
            reservationLabel: reservation?.label ?? null,
            memberQrToken: member?.qrToken ?? null
          }),
          tags,
          isKid,
          memberLinked: !!row.memberId
        };
      })
      .sort((a, b) => {
        const last = String(a.lastName || a.fullName || "").localeCompare(
          String(b.lastName || b.fullName || ""),
          undefined,
          { sensitivity: "base" }
        );
        if (last !== 0) return last;
        return String(a.firstName || "").localeCompare(String(b.firstName || ""), undefined, {
          sensitivity: "base"
        });
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
    // bigint columns come back as strings from the driver — compare numerically
    if (lifegroup.churchId != null && Number(lifegroup.churchId) !== Number(churchId)) {
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

  private async findOrCreateLifeGroupForChurch(
    name: string,
    churchId: number,
    cache: Map<string, LifeGroupEntity>
  ) {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const cacheKey = `${churchId}:${trimmed.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let lifeGroup = await this.lifeGroupsRepo
      .createQueryBuilder("lg")
      .where("LOWER(lg.name) = LOWER(:name)", { name: trimmed })
      .andWhere("lg.churchId = :churchId", { churchId })
      .getOne();

    if (!lifeGroup) {
      lifeGroup = await this.lifeGroupsRepo.save(
        this.lifeGroupsRepo.create({
          name: trimmed,
          coachMemberId: null,
          churchId
        })
      );
    }

    cache.set(cacheKey, lifeGroup);
    return lifeGroup;
  }

  private async linkMemberToImportLifeGroup(
    member: MemberEntity,
    lifeGroupName: string | null | undefined,
    importChurchId: number | null,
    cache: Map<string, LifeGroupEntity>,
    importLifeGroupId: number | null = null
  ) {
    const trimmed = lifeGroupName?.trim();

    if (trimmed) {
      if (!importChurchId) {
        throw new BadRequestException(
          "Lifegroup can only be assigned when using a church import template. Download a church template and fill the Lifegroup column there."
        );
      }

      const lifeGroup = await this.findOrCreateLifeGroupForChurch(trimmed, importChurchId, cache);
      if (!lifeGroup) return;

      await this.ensureLifegroupMembership(member.id, lifeGroup.id);
      return;
    }

    if (!importLifeGroupId) return;

    if (!importChurchId) {
      throw new BadRequestException(
        "Lifegroup can only be assigned when using a church import template. Download a church template and select a lifegroup there."
      );
    }

    await this.ensureLifegroupMembership(member.id, importLifeGroupId);
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
          churchId,
          qrToken: generateQrToken()
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

  private normalizeParticipantName(name: string) {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private async assertGuestNotAlreadyRegistered(eventId: number, fullName: string) {
    const normalized = this.normalizeParticipantName(fullName);
    const existing = await this.participantsRepo
      .createQueryBuilder("participant")
      .where("participant.eventId = :eventId", { eventId })
      .andWhere("participant.memberId IS NULL")
      .andWhere("LOWER(TRIM(participant.fullName)) = :fullName", { fullName: normalized })
      .getOne();

    if (existing) {
      throw new BadRequestException(`${fullName.trim()} is already registered for this event.`);
    }
  }

  private async createEventParticipant(
    event: EventEntity,
    member: MemberEntity,
    reservationId: number | null = null
  ) {
    const saved = await this.participantsRepo.save(
      this.participantsRepo.create({
        eventId: event.id,
        memberId: member.id,
        reservationId,
        fullName: `${member.firstName} ${member.lastName}`,
        email: member.email,
        phone: member.phone,
        qrToken: generateQrToken(),
        registrationPaid: false,
        registrationAmount: event.registrationFee && Number(event.registrationFee) > 0 ? event.registrationFee : null
      })
    );
    const [participant] = await this.enrichParticipants([saved]);
    return participant;
  }

  private async createGuestEventParticipant(
    event: EventEntity,
    body: {
      fullName: string;
      email?: string | null;
      phone?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      reservationId?: number | null;
    }
  ) {
    const fullName = body.fullName.trim();
    await this.assertGuestNotAlreadyRegistered(event.id, fullName);

    const saved = await this.participantsRepo.save(
      this.participantsRepo.create({
        eventId: event.id,
        memberId: null,
        reservationId: body.reservationId ?? null,
        fullName,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        qrToken: generateQrToken(),
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

  private mapReservation(
    row: EventReservationEntity,
    churchName: string | null = null,
    filledCount = 0
  ) {
    return {
      id: row.id,
      eventId: row.eventId,
      churchId: row.churchId,
      churchName,
      label: row.label,
      participantType: row.participantType,
      reservedCount: Number(row.reservedCount),
      filledCount: Number(filledCount || 0),
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private async countReservationParticipants(eventId: number, reservationId: number) {
    return this.participantsRepo.count({ where: { eventId, reservationId } });
  }

  private async assertReservationHasCapacity(
    eventId: number,
    reservationId: number,
    addCount = 1,
    reservation?: EventReservationEntity | null
  ) {
    const existing =
      reservation ||
      (await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } }));
    if (!existing) throw new NotFoundException("Reservation list not found");

    const filledCount = await this.countReservationParticipants(eventId, reservationId);
    const reservedCount = Number(existing.reservedCount || 0);
    const remaining = Math.max(reservedCount - filledCount, 0);

    if (addCount > remaining) {
      throw new BadRequestException(
        remaining === 0
          ? `Reservation "${existing.label}" is already filled (${filledCount}/${reservedCount}).`
          : `Only ${remaining} slot(s) left on reservation "${existing.label}" (${filledCount}/${reservedCount}).`
      );
    }

    return { reservation: existing, filledCount, reservedCount, remaining };
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
      requiresPreRegistration:
        body.requiresPreRegistration !== undefined
          ? !!body.requiresPreRegistration
          : existing?.requiresPreRegistration ?? false,
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
    await this.reservationsRepo.delete({ eventId: id });
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

  private async resolveChurchId(churchId: number | string | null | undefined) {
    if (churchId == null || churchId === "") return null;
    const id = Number(churchId);
    if (!id || Number.isNaN(id)) return null;
    const church = await this.churchesRepo.findOne({ where: { id } });
    if (!church) return null;
    return id;
  }

  private buildParticipantNameKey(firstName: string, lastName: string) {
    return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
  }

  private parseImportTagField(value?: string | null): string[] {
    if (!value?.trim()) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const part of value.split(",")) {
      const tag = part.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(tag);
    }
    return names;
  }

  private async resolveImportTags(
    tagNames: string[],
    tagCache: Map<string, TagEntity>
  ): Promise<TagEntity[]> {
    const resolved: TagEntity[] = [];

    for (const name of tagNames) {
      const key = name.toLowerCase();
      let tag = tagCache.get(key);
      if (!tag) {
        try {
          tag = await this.tagsRepo.save(this.tagsRepo.create({ name }));
        } catch (err: any) {
          if (err?.code === "ER_DUP_ENTRY") {
            tag = await this.tagsRepo
              .createQueryBuilder("tag")
              .where("LOWER(tag.name) = LOWER(:name)", { name })
              .getOne();
            if (!tag) throw err;
          } else {
            throw err;
          }
        }
        tagCache.set(key, tag);
      }
      resolved.push(tag);
    }

    return resolved;
  }

  private async assignMemberTags(memberId: number, tags: TagEntity[]) {
    await this.memberTagsRepo.delete({ memberId });
    if (!tags.length) return;
    await this.memberTagsRepo.save(
      tags.map((tag) => this.memberTagsRepo.create({ memberId, tagId: tag.id }))
    );
  }

  async importParticipantsBulk(
    eventId: number,
    body: {
      signature?: string;
      eventId?: number | string;
      churchId?: number | string | null;
      lifeGroupId?: number | string | null;
      participants?: any[];
    }
  ) {
    if (!body?.signature || !VALID_EVENT_PARTICIPANT_BULK_SIGNATURES.has(body.signature)) {
      throw new BadRequestException(
        "Invalid or missing template signature. Please download and use the participant import template from this system."
      );
    }

    const templateEventId = body.eventId != null ? Number(body.eventId) : null;
    if (!templateEventId || Number.isNaN(templateEventId)) {
      throw new BadRequestException("The event identifier in this template is invalid.");
    }
    if (templateEventId !== eventId) {
      throw new BadRequestException(
        "This template belongs to a different event. Download the template from the event you are importing into."
      );
    }

    const event = await this.getEventOrFail(eventId);
    const rows = Array.isArray(body.participants) ? body.participants : [];
    if (!rows.length) {
      throw new BadRequestException("No participant rows were provided for import.");
    }

    let importChurchId: number | null = null;
    if (body.churchId != null && body.churchId !== "") {
      importChurchId = await this.resolveChurchId(body.churchId);
      if (!importChurchId) {
        throw new BadRequestException("The church identifier in this template is invalid.");
      }
    }

    let importLifeGroupId: number | null = null;
    if (body.lifeGroupId != null && body.lifeGroupId !== "") {
      if (!importChurchId) {
        throw new BadRequestException(
          "Lifegroup can only be assigned when using a church import template. Download a church template and select a lifegroup there."
        );
      }
      importLifeGroupId = Number(body.lifeGroupId);
      if (!importLifeGroupId || Number.isNaN(importLifeGroupId)) {
        throw new BadRequestException("The lifegroup identifier in this template is invalid.");
      }
      await this.validateChurchAndLifeGroup(importChurchId, importLifeGroupId);
    }

    const existingParticipants = await this.participantsRepo.find({
      where: { eventId },
      select: ["memberId", "fullName"]
    });
    const registeredMemberIds = new Set(
      existingParticipants.map((row) => row.memberId).filter(Boolean) as number[]
    );
    const registeredGuestNames = new Set(
      existingParticipants
        .filter((row) => !row.memberId && row.fullName)
        .map((row) => this.normalizeParticipantName(row.fullName))
    );
    const batchNames = new Map<string, number>();
    const importTagCache = new Map(
      (await this.tagsRepo.find()).map((tag) => [tag.name.toLowerCase(), tag])
    );
    const importLifeGroupCache = new Map<string, LifeGroupEntity>();

    const created: Awaited<ReturnType<EventsService["createEventParticipant"]>>[] = [];
    const errors: { row: number; message: string }[] = [];

    for (const row of rows) {
      const rowNumber = Number(row?.rowNumber) || 0;
      const firstName = row?.firstName?.trim();
      const lastName = row?.lastName?.trim();
      const lifeGroupName = row?.lifeGroup?.trim() || "";

      if (!firstName || !lastName) {
        errors.push({
          row: rowNumber,
          message: "First name and last name are required."
        });
        continue;
      }

      const fullName = `${firstName} ${lastName}`;
      const nameKey = this.buildParticipantNameKey(firstName, lastName);
      if (batchNames.has(nameKey)) {
        errors.push({
          row: rowNumber,
          message: `Duplicate name in this file (also on row ${batchNames.get(nameKey)}).`
        });
        continue;
      }
      batchNames.set(nameKey, rowNumber);

      try {
        const member = await this.findMemberByName(firstName, lastName);
        const tagNames = this.parseImportTagField(row?.tag);

        if (importChurchId) {
          let resolvedMember = member;

          if (!resolvedMember) {
            resolvedMember = await this.membersRepo.save(
              this.membersRepo.create({
                firstName,
                lastName,
                email: null,
                phone: row.phone?.trim() || null,
                gender: "",
                churchId: importChurchId,
                qrToken: generateQrToken()
              })
            );
            if (tagNames.length) {
              const tags = await this.resolveImportTags(tagNames, importTagCache);
              await this.assignMemberTags(resolvedMember.id, tags);
            }
          } else {
            const updates: Partial<MemberEntity> = {};
            if (row.phone?.trim()) updates.phone = row.phone.trim();
            updates.churchId = importChurchId;
            await this.membersRepo.update(resolvedMember.id, updates);
            resolvedMember = { ...resolvedMember, ...updates };
            if (tagNames.length) {
              const tags = await this.resolveImportTags(tagNames, importTagCache);
              await this.assignMemberTags(resolvedMember.id, tags);
            }
          }

          await this.linkMemberToImportLifeGroup(
            resolvedMember,
            lifeGroupName,
            importChurchId,
            importLifeGroupCache,
            importLifeGroupId
          );

          if (registeredMemberIds.has(resolvedMember.id)) {
            errors.push({
              row: rowNumber,
              message: `${fullName} is already registered for this event.`
            });
            continue;
          }

          const participant = await this.createEventParticipant(event, resolvedMember);
          registeredMemberIds.add(resolvedMember.id);
          created.push(participant);
          continue;
        }

        if (lifeGroupName) {
          errors.push({
            row: rowNumber,
            message:
              "Lifegroup can only be assigned when using a church import template. Download a church template and fill the Lifegroup column there."
          });
          continue;
        }

        if (member) {
          if (registeredMemberIds.has(member.id)) {
            errors.push({
              row: rowNumber,
              message: `${fullName} is already registered for this event.`
            });
            continue;
          }

          const participant = await this.createEventParticipant(event, member);
          registeredMemberIds.add(member.id);
          created.push(participant);
          continue;
        }

        const guestNameKey = this.normalizeParticipantName(fullName);
        if (registeredGuestNames.has(guestNameKey)) {
          errors.push({
            row: rowNumber,
            message: `${fullName} is already registered for this event.`
          });
          continue;
        }

        const participant = await this.createGuestEventParticipant(event, {
          fullName,
          phone: row.phone?.trim() || null
        });
        registeredGuestNames.add(guestNameKey);
        created.push(participant);
      } catch (err) {
        errors.push({
          row: rowNumber,
          message: err instanceof Error ? err.message : "Failed to add participant."
        });
      }
    }

    return {
      created: created.length,
      participants: created,
      errors
    };
  }

  async addParticipant(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    const churchId = body.churchId ? Number(body.churchId) : null;
    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;
    const addAsMember = !!body.addAsMember;

    if (body.memberId) {
      const member = await this.membersRepo.findOne({ where: { id: Number(body.memberId) } });
      if (!member) throw new NotFoundException("Member not found");
      await this.ensureLifegroupMembership(member.id, lifegroupId);
      if (churchId) {
        await this.membersRepo.update(member.id, { churchId });
      }
      if (churchId) await this.validateChurchAndLifeGroup(churchId, lifegroupId);
      await this.assertNotAlreadyRegistered(eventId, member.id);
      return this.createEventParticipant(event, member);
    }

    if (addAsMember) {
      if (!churchId) {
        throw new BadRequestException("Church is required when adding a participant as a member.");
      }

      const name = this.buildParticipantName(body);
      if (!name.firstName || !name.lastName) {
        throw new BadRequestException("Participant first name and last name are required");
      }

      await this.validateChurchAndLifeGroup(churchId, lifegroupId);
      const { member } = await this.resolveMemberForRegistration(
        name.firstName,
        name.lastName,
        lifegroupId,
        churchId
      );
      await this.assertNotAlreadyRegistered(eventId, member.id);
      return this.createEventParticipant(event, member);
    }

    const fullName = body.fullName?.trim();
    if (!fullName) {
      throw new BadRequestException("Participant full name is required");
    }

    const reservationId = body.reservationId ? Number(body.reservationId) : null;
    if (reservationId) {
      await this.assertReservationHasCapacity(eventId, reservationId, 1);
    }

    return this.createGuestEventParticipant(event, {
      fullName,
      email: body.email,
      phone: body.phone,
      reservationId
    });
  }

  async editParticipant(eventId: number, participantId: number, body: any) {
    await this.getEventOrFail(eventId);
    const existing = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!existing) throw new NotFoundException("Participant not found");

    const placement = body.placement === "church" || body.placement === "guest" ? body.placement : null;
    if (placement) {
      return this.reassignLinkedParticipant(eventId, existing, body, placement);
    }

    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;
    const churchId = body.churchId ? Number(body.churchId) : null;
    const addAsMember = !!body.addAsMember;

    if (addAsMember) {
      if (existing.memberId) {
        throw new BadRequestException("This participant is already linked to a member.");
      }
      if (!churchId) {
        throw new BadRequestException("Church is required when adding a participant as a member.");
      }

      const name = this.buildParticipantName(body, existing.fullName);
      if (!name.firstName || !name.lastName) {
        throw new BadRequestException("Participant first name and last name are required");
      }

      await this.validateChurchAndLifeGroup(churchId, lifegroupId);
      const { member } = await this.resolveMemberForRegistration(
        name.firstName,
        name.lastName,
        lifegroupId,
        churchId
      );

      const alreadyRegistered = await this.participantsRepo.findOne({
        where: { eventId, memberId: member.id }
      });
      if (alreadyRegistered && Number(alreadyRegistered.id) !== Number(participantId)) {
        throw new BadRequestException("That member is already registered for this event.");
      }

      await this.participantsRepo.update(participantId, {
        memberId: member.id,
        fullName: `${member.firstName} ${member.lastName}`,
        email: body.email !== undefined ? body.email || null : member.email ?? existing.email,
        phone: body.phone !== undefined ? body.phone || null : member.phone ?? existing.phone
      });

      const created = await this.participantsRepo.findOne({ where: { id: participantId } });
      const [participant] = await this.enrichParticipants([created!]);
      return participant;
    }

    let memberId =
      body.memberId !== undefined ? (body.memberId ? Number(body.memberId) : null) : existing.memberId;

    if (body.memberId) {
      const member = await this.membersRepo.findOne({ where: { id: memberId! } });
      if (!member) throw new NotFoundException("Member not found");
      await this.ensureLifegroupMembership(member.id, lifegroupId);
      if (churchId) {
        await this.membersRepo.update(member.id, { churchId });
      }
    } else {
      const name = this.buildParticipantName(body, existing.fullName);
      if (name.firstName && name.lastName) {
        const resolved = await this.resolveMemberForRegistration(
          name.firstName,
          name.lastName,
          lifegroupId,
          churchId
        );
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

  private async reassignLinkedParticipant(
    eventId: number,
    existing: EventParticipantEntity,
    body: any,
    placement: "church" | "guest"
  ) {
    if (!existing.memberId) {
      throw new BadRequestException("Only linked members can be reassigned from Unassigned.");
    }

    const member = await this.membersRepo.findOne({ where: { id: existing.memberId } });
    if (!member) throw new NotFoundException("Member not found");

    const firstName = String(body.firstName ?? member.firstName ?? "").trim();
    const lastName = String(body.lastName ?? member.lastName ?? "").trim();
    if (!firstName || !lastName) {
      throw new BadRequestException("First name and last name are required");
    }

    const email =
      body.email !== undefined ? String(body.email || "").trim() || null : member.email ?? existing.email;
    const phone =
      body.phone !== undefined ? String(body.phone || "").trim() || null : member.phone ?? existing.phone;
    const fullName = `${firstName} ${lastName}`;

    if (placement === "church") {
      const churchId = body.churchId ? Number(body.churchId) : null;
      if (!churchId) {
        throw new BadRequestException("Church is required when assigning to a church.");
      }
      await this.validateChurchAndLifeGroup(churchId, null);

      await this.membersRepo.update(member.id, {
        firstName,
        lastName,
        email,
        phone,
        churchId
      });
      await this.participantsRepo.update(existing.id, {
        fullName,
        email,
        phone,
        reservationId: null
      });
    } else {
      const reservationId = body.reservationId ? Number(body.reservationId) : null;
      if (!reservationId) {
        throw new BadRequestException("Guest list is required when moving to a reservation.");
      }

      const reservation = await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } });
      if (!reservation) throw new NotFoundException("Reservation list not found");
      if (reservation.churchId) {
        throw new BadRequestException("Select a guest reservation list (not a church reservation).");
      }

      if (Number(existing.reservationId || 0) !== reservationId) {
        await this.assertReservationHasCapacity(eventId, reservationId, 1, reservation);
      }

      await this.membersRepo.update(member.id, {
        firstName,
        lastName,
        email,
        phone,
        churchId: null
      });
      await this.participantsRepo.update(existing.id, {
        fullName,
        email,
        phone,
        reservationId
      });
    }

    const updated = await this.participantsRepo.findOne({ where: { id: existing.id } });
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

  private parseGuestFullName(fullName: string) {
    const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (parts.length < 2) return { firstName: null as string | null, lastName: null as string | null };
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1]
    };
  }

  private mapLinkCandidate(
    member: MemberEntity,
    churchNameById: Map<number, string>,
    pastorChurchByMemberId: Map<number, ChurchEntity>,
    lifegroupByMemberId: Map<number, LifeGroupEntity>
  ) {
    const lifegroup = lifegroupByMemberId.get(Number(member.id)) || null;
    const churchId =
      resolveMemberChurchId(member, pastorChurchByMemberId) ?? lifegroup?.churchId ?? null;
    return {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      fullName: `${member.firstName} ${member.lastName}`,
      email: member.email ?? null,
      phone: member.phone ?? null,
      churchId,
      churchName: churchId ? churchNameById.get(Number(churchId)) || null : null,
      lifegroupName: lifegroup?.name ?? null
    };
  }

  private async buildMemberLookupContext(members: MemberEntity[]) {
    const memberIds = members.map((member) => Number(member.id));
    const pastorChurchByMemberId = await loadPastorChurchesByMemberId(this.churchesRepo, memberIds);

    const memberships = memberIds.length
      ? await this.lifeGroupMembersRepo.find({ where: { memberId: In(memberIds) } })
      : [];
    const lifegroupIds = [...new Set(memberships.map((row) => Number(row.lifeGroupId)))];
    const lifegroups = lifegroupIds.length
      ? await this.lifeGroupsRepo.find({ where: { id: In(lifegroupIds) } })
      : [];
    const lifegroupById = new Map(lifegroups.map((group) => [Number(group.id), group]));
    const lifegroupByMemberId = new Map<number, LifeGroupEntity>();
    for (const link of memberships) {
      const group = lifegroupById.get(Number(link.lifeGroupId));
      if (group && !lifegroupByMemberId.has(Number(link.memberId))) {
        lifegroupByMemberId.set(Number(link.memberId), group);
      }
    }

    const churchIds = [
      ...new Set(
        [
          ...members.map((member) => resolveMemberChurchId(member, pastorChurchByMemberId)),
          ...lifegroups.map((group) => group.churchId)
        ]
          .filter((id) => id != null)
          .map((id) => Number(id))
      )
    ];
    const churches = churchIds.length ? await this.churchesRepo.find({ where: { id: In(churchIds) } }) : [];
    const churchNameById = new Map(churches.map((church) => [Number(church.id), getChurchDisplayName(church)]));

    return { pastorChurchByMemberId, lifegroupByMemberId, churchNameById };
  }

  private async applyParticipantMemberLink(
    participant: EventParticipantEntity,
    member: MemberEntity,
    registeredMemberIds: Set<number>
  ) {
    if (registeredMemberIds.has(Number(member.id))) {
      return { linked: false as const, skipped: true as const };
    }

    await this.participantsRepo.update(participant.id, {
      memberId: member.id,
      fullName: `${member.firstName} ${member.lastName}`,
      email: member.email ?? participant.email,
      phone: member.phone ?? participant.phone
    });

    registeredMemberIds.add(Number(member.id));
    return { linked: true as const, skipped: false as const };
  }

  async linkParticipantsToMembers(
    eventId: number,
    body: {
      participantIds?: number[];
      links?: Array<{ participantId?: number; memberId?: number }>;
    } = {}
  ) {
    await this.getEventOrFail(eventId);

    const unlinked = await this.participantsRepo.find({
      where: { eventId, memberId: IsNull() }
    });
    const unlinkedById = new Map(unlinked.map((row) => [Number(row.id), row]));

    const allParticipants = await this.participantsRepo.find({
      where: { eventId },
      select: ["id", "memberId"]
    });
    const registeredMemberIds = new Set(
      allParticipants.map((row) => row.memberId).filter(Boolean).map((id) => Number(id))
    );

    const linkedRows: number[] = [];
    const unmatchedNames: string[] = [];
    const skippedNames: string[] = [];
    const needsResolution: Array<{
      participantId: number;
      fullName: string;
      firstName: string | null;
      lastName: string;
      candidates: Array<{
        id: number;
        firstName: string;
        lastName: string;
        fullName: string;
        email: string | null;
        phone: string | null;
        churchId: number | null;
        churchName: string | null;
        lifegroupName: string | null;
      }>;
    }> = [];

    const explicitLinks = Array.isArray(body.links) ? body.links : [];
    const explicitParticipantIds = new Set<number>();

    if (explicitLinks.length) {
      const memberIds = [
        ...new Set(
          explicitLinks
            .map((link) => Number(link.memberId))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      ];
      const members = memberIds.length
        ? await this.membersRepo.find({ where: { id: In(memberIds) } })
        : [];
      const memberById = new Map(members.map((member) => [Number(member.id), member]));

      for (const link of explicitLinks) {
        const participantId = Number(link.participantId);
        const memberId = Number(link.memberId);
        if (!Number.isFinite(participantId) || participantId <= 0) continue;
        if (!Number.isFinite(memberId) || memberId <= 0) continue;

        explicitParticipantIds.add(participantId);
        const participant = unlinkedById.get(participantId);
        if (!participant) {
          skippedNames.push(`Participant #${participantId}`);
          continue;
        }

        const member = memberById.get(memberId);
        if (!member) {
          unmatchedNames.push(participant.fullName || `Participant #${participantId}`);
          continue;
        }

        const result = await this.applyParticipantMemberLink(participant, member, registeredMemberIds);
        if (result.skipped) {
          skippedNames.push(participant.fullName || `Participant #${participantId}`);
          continue;
        }
        linkedRows.push(participant.id);
        unlinkedById.delete(participantId);
      }
    }

    const requestedIds = Array.isArray(body.participantIds)
      ? new Set(body.participantIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
      : null;

    const autoCandidates = [...unlinkedById.values()].filter((row) => {
      if (explicitParticipantIds.has(Number(row.id))) return false;
      if (requestedIds) return requestedIds.has(Number(row.id));
      // Explicit link confirmation only — do not auto-match the rest of the event.
      if (explicitLinks.length) return false;
      return true;
    });

    if (!autoCandidates.length && !linkedRows.length) {
      return {
        linked: 0,
        unmatched: unmatchedNames.length,
        skipped: skippedNames.length,
        needsResolution: [],
        participants: [],
        unmatchedNames,
        skippedNames
      };
    }

    if (autoCandidates.length) {
      const members = await this.membersRepo.find();
      const memberByFullName = new Map<string, MemberEntity>();
      const membersByLastName = new Map<string, MemberEntity[]>();

      for (const member of members) {
        const fullKey = this.normalizeParticipantName(`${member.firstName} ${member.lastName}`);
        if (!memberByFullName.has(fullKey)) {
          memberByFullName.set(fullKey, member);
        }

        const lastKey = this.normalizeParticipantName(member.lastName || "");
        if (!lastKey) continue;
        const list = membersByLastName.get(lastKey) || [];
        list.push(member);
        membersByLastName.set(lastKey, list);
      }

      const pendingFamily: Array<{
        participant: EventParticipantEntity;
        fullName: string;
        firstName: string | null;
        lastName: string;
        familyMatches: MemberEntity[];
      }> = [];

      for (const participant of autoCandidates) {
        const fullName = participant.fullName?.trim() || "";
        if (!fullName) {
          unmatchedNames.push(participant.fullName || `Participant #${participant.id}`);
          continue;
        }

        const nameKey = this.normalizeParticipantName(fullName);
        let member = memberByFullName.get(nameKey) || null;
        const parsed = this.parseGuestFullName(fullName);

        if (!member && parsed.firstName && parsed.lastName) {
          member =
            memberByFullName.get(
              this.normalizeParticipantName(`${parsed.firstName} ${parsed.lastName}`)
            ) || null;
        }

        if (!member && parsed.firstName && parsed.lastName) {
          const exact = (
            membersByLastName.get(this.normalizeParticipantName(parsed.lastName)) || []
          ).find(
            (row) =>
              this.normalizeParticipantName(row.firstName || "") ===
              this.normalizeParticipantName(parsed.firstName!)
          );
          member = exact || null;
        }

        if (member) {
          const result = await this.applyParticipantMemberLink(
            participant,
            member,
            registeredMemberIds
          );
          if (result.skipped) {
            skippedNames.push(fullName);
            continue;
          }
          linkedRows.push(participant.id);
          continue;
        }

        const lastName = parsed.lastName || null;
        if (!lastName) {
          unmatchedNames.push(fullName);
          continue;
        }

        const familyMatches = (
          membersByLastName.get(this.normalizeParticipantName(lastName)) || []
        ).filter((row) => !registeredMemberIds.has(Number(row.id)));

        if (!familyMatches.length) {
          unmatchedNames.push(fullName);
          continue;
        }

        pendingFamily.push({
          participant,
          fullName,
          firstName: parsed.firstName,
          lastName,
          familyMatches
        });
      }

      if (pendingFamily.length) {
        const lookupMembers = [
          ...new Map(
            pendingFamily.flatMap((row) => row.familyMatches).map((member) => [Number(member.id), member])
          ).values()
        ];
        const { pastorChurchByMemberId, lifegroupByMemberId, churchNameById } =
          await this.buildMemberLookupContext(lookupMembers);

        for (const item of pendingFamily) {
          needsResolution.push({
            participantId: Number(item.participant.id),
            fullName: item.fullName,
            firstName: item.firstName,
            lastName: item.lastName,
            candidates: item.familyMatches
              .map((row) =>
                this.mapLinkCandidate(row, churchNameById, pastorChurchByMemberId, lifegroupByMemberId)
              )
              .sort((a, b) =>
                String(a.fullName || "").localeCompare(String(b.fullName || ""), undefined, {
                  sensitivity: "base"
                })
              )
          });
        }
      }
    }

    const refreshed = linkedRows.length
      ? await this.participantsRepo.find({ where: { id: In(linkedRows) } })
      : [];
    const participants = refreshed.length ? await this.enrichParticipants(refreshed) : [];

    return {
      linked: participants.length,
      unmatched: unmatchedNames.length,
      skipped: skippedNames.length,
      needsResolution,
      participants,
      unmatchedNames,
      skippedNames
    };
  }

  async checkIn(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    const token = body.token?.trim();
    const memberId = body.memberId != null && body.memberId !== "" ? Number(body.memberId) : NaN;
    const isManualMemberId =
      String(body.type || "").toLowerCase() === "manual" ||
      (Number.isFinite(memberId) && memberId > 0 && !token && !body.participantId);

    // Staff manual check-in by member ID (no QR token required)
    if (isManualMemberId) {
      return this.checkInMember(event, memberId);
    }

    if (!token) throw new BadRequestException("Invalid check-in payload");

    // Member identity QR (works across all events)
    if (body.type === "member" || body.memberId) {
      return this.checkInByMemberQr(event, Number(body.memberId), token);
    }

    // Legacy / guest participant QR (scoped to one registration)
    const participantId = Number(body.participantId);
    if (!participantId) throw new BadRequestException("Invalid check-in payload");

    const participant = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!participant) throw new NotFoundException("Participant not found");
    if (participant.qrToken !== token) throw new BadRequestException("Invalid QR token");
    return this.markParticipantAttended(participant);
  }

  private async checkInByMemberQr(event: EventEntity, memberId: number, token: string) {
    const resolvedMemberId = Number(memberId);
    if (!Number.isFinite(resolvedMemberId) || resolvedMemberId <= 0) {
      throw new BadRequestException("Invalid check-in payload");
    }

    const member = await this.membersRepo.findOne({ where: { id: resolvedMemberId } });
    if (!member) throw new NotFoundException("Member not found");
    if (!member.qrToken || member.qrToken !== token) {
      throw new BadRequestException("Invalid QR token");
    }

    return this.checkInMember(event, Number(member.id), member);
  }

  private async checkInMember(event: EventEntity, memberId: number, memberEntity?: MemberEntity | null) {
    // MySQL bigint IDs often arrive as strings — coerce before Number.isFinite checks.
    const resolvedMemberId = Number(memberId);
    if (!Number.isFinite(resolvedMemberId) || resolvedMemberId <= 0) {
      throw new BadRequestException("Invalid member ID");
    }

    const member =
      memberEntity || (await this.membersRepo.findOne({ where: { id: resolvedMemberId } }));
    if (!member) throw new NotFoundException("Member not found");

    let participant = await this.participantsRepo.findOne({
      where: { eventId: event.id, memberId: Number(member.id) }
    });

    if (!participant) {
      if (event.requiresPreRegistration) {
        throw new BadRequestException({
          code: "NOT_REGISTERED",
          message: `This member is not registered to attend this ${event.name}.`
        });
      }
      const created = await this.createEventParticipant(event, member);
      participant = await this.participantsRepo.findOne({ where: { id: Number(created.id) } });
      if (!participant) throw new NotFoundException("Participant not found");
    }

    return this.markParticipantAttended(participant);
  }

  private async markParticipantAttended(participant: EventParticipantEntity) {
    if (participant.attendedAt) {
      return { ...this.mapParticipant(participant), alreadyCheckedIn: true };
    }

    participant.attendedAt = new Date();
    const updated = await this.participantsRepo.save(participant);
    return { ...this.mapParticipant(updated), alreadyCheckedIn: false };
  }

  async cancelCheckIn(eventId: number, participantId: number) {
    await this.getEventOrFail(eventId);
    const participant = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!participant) throw new NotFoundException("Participant not found");

    if (!participant.attendedAt) {
      return { ...this.mapParticipant(participant), alreadyCancelled: true };
    }

    participant.attendedAt = null;
    const updated = await this.participantsRepo.save(participant);
    return { ...this.mapParticipant(updated), alreadyCancelled: false };
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

  private async syncReservedParticipantsFromReservations(eventId: number) {
    const rows = await this.reservationsRepo.find({ where: { eventId } });
    const total = rows.reduce((sum, row) => sum + Number(row.reservedCount || 0), 0);
    await this.eventsRepo.update(eventId, {
      reservedParticipants: total
    });
    return total;
  }

  private async enrichReservations(rows: EventReservationEntity[]) {
    const churchIds = [...new Set(rows.map((row) => row.churchId).filter(Boolean))] as number[];
    const churches = churchIds.length
      ? await this.churchesRepo.find({ where: { id: In(churchIds) } })
      : [];
    const churchNameById = new Map(churches.map((church) => [church.id, getChurchDisplayName(church)]));

    const reservationIds = rows.map((row) => Number(row.id)).filter(Boolean);
    const filledCountById = new Map<number, number>();
    if (reservationIds.length) {
      const counts = await this.participantsRepo
        .createQueryBuilder("participant")
        .select("participant.reservationId", "reservationId")
        .addSelect("COUNT(*)", "count")
        .where("participant.reservationId IN (:...reservationIds)", { reservationIds })
        .groupBy("participant.reservationId")
        .getRawMany();

      for (const row of counts) {
        filledCountById.set(Number(row.reservationId), Number(row.count || 0));
      }
    }

    return rows.map((row) =>
      this.mapReservation(
        row,
        row.churchId ? churchNameById.get(row.churchId) || null : null,
        filledCountById.get(Number(row.id)) || 0
      )
    );
  }

  async listReservations(eventId: number) {
    await this.getEventOrFail(eventId);
    const rows = await this.reservationsRepo.find({ where: { eventId }, order: { id: "ASC" } });
    return this.enrichReservations(rows);
  }

  async addReservation(eventId: number, body: any) {
    await this.getEventOrFail(eventId);

    const reservedCount = Number(body.reservedCount);
    if (!Number.isFinite(reservedCount) || reservedCount < 0) {
      throw new BadRequestException("Reserved count must be zero or greater");
    }

    const groupName = (body.label || body.groupName || body.participantType || "").trim();
    if (!groupName) throw new BadRequestException("Group name is required");

    await this.assertReservationUnique(eventId, groupName);

    const saved = await this.reservationsRepo.save(
      this.reservationsRepo.create({
        eventId,
        churchId: null,
        label: groupName,
        participantType: groupName,
        reservedCount,
        notes: null
      })
    );
    await this.syncReservedParticipantsFromReservations(eventId);
    const [mapped] = await this.enrichReservations([saved]);
    return mapped;
  }

  async editReservation(eventId: number, reservationId: number, body: any) {
    await this.getEventOrFail(eventId);
    const existing = await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } });
    if (!existing) throw new NotFoundException("Reservation not found");

    const reservedCount =
      body.reservedCount !== undefined ? Number(body.reservedCount) : existing.reservedCount;
    if (!Number.isFinite(reservedCount) || reservedCount < 0) {
      throw new BadRequestException("Reserved count must be zero or greater");
    }

    const groupName = (
      body.label ??
      body.groupName ??
      body.participantType ??
      existing.label
    )
      .toString()
      .trim();
    if (!groupName) throw new BadRequestException("Group name is required");

    await this.assertReservationUnique(eventId, groupName, reservationId);

    await this.reservationsRepo.update(reservationId, {
      churchId: null,
      label: groupName,
      participantType: groupName,
      reservedCount,
      notes: null
    });
    await this.syncReservedParticipantsFromReservations(eventId);

    const updated = await this.reservationsRepo.findOne({ where: { id: reservationId } });
    const [mapped] = await this.enrichReservations([updated!]);
    return mapped;
  }

  private async assertReservationUnique(eventId: number, groupName: string, excludeId?: number) {
    const rows = await this.reservationsRepo.find({ where: { eventId } });
    const nameKey = groupName.trim().toLowerCase();
    const duplicate = rows.find((row) => {
      if (excludeId && row.id === excludeId) return false;
      return row.label.trim().toLowerCase() === nameKey;
    });
    if (duplicate) {
      throw new BadRequestException("A reservation with this group name already exists");
    }
  }

  async removeReservation(eventId: number, reservationId: number) {
    await this.getEventOrFail(eventId);
    const existing = await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } });
    if (!existing) throw new NotFoundException("Reservation not found");
    await this.reservationsRepo.delete(reservationId);
    await this.syncReservedParticipantsFromReservations(eventId);
    return { id: reservationId, deleted: true };
  }

  async addReservationParticipants(eventId: number, reservationId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    const reservation = await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } });
    if (!reservation) throw new NotFoundException("Reservation list not found");

    const rawNames = Array.isArray(body?.names)
      ? body.names
      : typeof body?.namesText === "string"
        ? body.namesText.split(/\r?\n/)
        : [];

    const names = rawNames
      .map((name: unknown) => String(name || "").trim())
      .filter((name: string) => !!name);

    if (!names.length) {
      throw new BadRequestException("Add at least one name.");
    }

    const uniqueNames: string[] = [];
    const seen = new Set<string>();
    for (const name of names) {
      const key = this.normalizeParticipantName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueNames.push(name);
    }

    await this.assertReservationHasCapacity(eventId, reservationId, uniqueNames.length, reservation);

    const created = [];
    const errors: { name: string; message: string }[] = [];

    for (const fullName of uniqueNames) {
      try {
        const participant = await this.createGuestEventParticipant(event, {
          fullName,
          reservationId
        });
        created.push(participant);
      } catch (err) {
        errors.push({
          name: fullName,
          message: err instanceof Error ? err.message : "Failed to add participant."
        });
      }
    }

    return {
      created: created.length,
      participants: created,
      errors,
      reservation: (await this.enrichReservations([reservation]))[0]
    };
  }

  async dashboard(eventId: number) {
    const event = await this.view(eventId);
    const participants = await this.listParticipants(eventId);
    const pledges = event.allowPledges ? await this.listPledges(eventId) : [];
    const reservations = await this.listReservations(eventId);

    const attendedCount = participants.filter((p) => p.attendedAt).length;
    // Guest-reservation names are covered by reserved slots — keep them out of
    // registered / adults / kids so they are not double-counted with reserved.
    const registeredParticipants = participants.filter(
      (p) => !(p.reservationId && !p.churchId)
    );
    const kidsCount = registeredParticipants.filter((p) => p.isKid).length;
    const adultCount = registeredParticipants.length - kidsCount;
    const registrationCollected = participants
      .filter((p) => p.registrationPaid)
      .reduce((sum, p) => sum + (p.registrationAmount || 0), 0);
    const pledgesCollected = pledges.filter((p) => p.paid).reduce((sum, p) => sum + p.amount, 0);
    const pledgesTotal = pledges.reduce((sum, p) => sum + p.amount, 0);
    const reservedTotal =
      event.reservedParticipants != null
        ? Number(event.reservedParticipants)
        : reservations.reduce((sum, row) => sum + row.reservedCount, 0);

    return {
      event,
      participants,
      pledges,
      reservations,
      stats: {
        participantCount: registeredParticipants.length,
        adultCount,
        kidsCount,
        expectedParticipants: event.expectedParticipants || 0,
        reservedTotal,
        attendedCount,
        attendanceRate: participants.length ? Math.round((attendedCount / participants.length) * 100) : 0,
        registrationCollected,
        pledgesCollected,
        pledgesTotal,
        totalCollected: registrationCollected + pledgesCollected
      }
    };
  }

  private async loadSignupOptions() {
    const churches = await this.churchesRepo.find({ order: { id: "DESC" } });
    const lifegroups = await this.lifeGroupsRepo.find({ order: { id: "DESC" } });
    return {
      churches: sortChurchesMainFirst(
        churches.map((church) => ({
          id: church.id,
          name: getChurchDisplayName(church)
        }))
      ),
      lifegroups: lifegroups.map((group) => ({
        id: group.id,
        name: group.name,
        churchId: group.churchId
      }))
    };
  }

  async getSignupInfo(eventId: number) {
    const event = await this.getEventOrFail(eventId);
    const registration = this.getRegistrationStatus(event);
    const options = await this.loadSignupOptions();
    const reservations = await this.listReservations(eventId);
    return {
      event: this.mapEvent(event),
      ...registration,
      ...options,
      reservations: reservations
        .filter((row) => !row.churchId)
        .map((row) => ({
          id: row.id,
          label: row.label,
          reservedCount: row.reservedCount
        }))
    };
  }

  async getPublicRegistration(eventId: number, participantId: number) {
    const event = await this.getEventOrFail(eventId);
    const fee = Number(event.registrationFee || 0);
    if (fee <= 0) throw new BadRequestException("This event has no registration fee");

    const participant = await this.participantsRepo.findOne({ where: { id: participantId, eventId } });
    if (!participant) throw new NotFoundException("Registration not found");

    const [enriched] = await this.enrichParticipants([participant]);
    return {
      event: {
        id: event.id,
        name: event.name,
        eventDate: event.eventDate,
        eventTime: this.normalizeEventTime(event.eventTime),
        location: event.location,
        registrationFee: fee
      },
      participant: {
        id: enriched.id,
        fullName: enriched.fullName,
        registrationPaid: enriched.registrationPaid,
        registrationAmount: enriched.registrationAmount
      }
    };
  }

  async publicPayRegistration(eventId: number, participantId: number, body: any) {
    return this.payRegistration(eventId, participantId, body);
  }

  private async resolveSignupReservation(eventId: number, reservationId: number | null) {
    if (!reservationId) return null;

    const reservation = await this.reservationsRepo.findOne({ where: { id: reservationId, eventId } });
    if (!reservation) throw new NotFoundException("Reservation list not found");
    if (reservation.churchId) {
      throw new BadRequestException("Selected reservation list is not available for guest registration.");
    }
    return reservation;
  }

  async publicSignup(eventId: number, body: any) {
    const event = await this.getEventOrFail(eventId);
    await this.assertRegistrationOpen(event);

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const churchId = body.churchId ? Number(body.churchId) : null;
    const lifegroupId = body.lifegroupId ? Number(body.lifegroupId) : null;
    const reservationId = body.reservationId ? Number(body.reservationId) : null;

    if (!firstName) throw new BadRequestException("First name is required");
    if (!lastName) throw new BadRequestException("Last name is required");
    if (churchId && reservationId) {
      throw new BadRequestException("Choose either a church or a reservation list, not both.");
    }
    if (lifegroupId && !churchId) {
      throw new BadRequestException("LifeGroup can only be selected with a church.");
    }

    const reservation = await this.resolveSignupReservation(eventId, reservationId);
    const resolvedReservationId = reservation ? Number(reservation.id) : null;
    if (resolvedReservationId) {
      await this.assertReservationHasCapacity(eventId, resolvedReservationId, 1, reservation);
    }

    let participant;
    if (churchId) {
      await this.validateChurchAndLifeGroup(churchId, lifegroupId);

      const { member } = await this.resolveMemberForRegistration(firstName, lastName, lifegroupId, churchId);
      await this.assertNotAlreadyRegistered(eventId, member.id);
      participant = await this.createEventParticipant(event, member, null);
    } else {
      participant = await this.createGuestEventParticipant(event, {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        reservationId: resolvedReservationId
      });
    }

    const paymentRequired = Number(event.registrationFee || 0) > 0;

    return {
      participant,
      paymentRequired,
      paymentUrl: paymentRequired ? `/events/${eventId}/register/${participant.id}` : null,
      message: "You have successfully registered to the event."
    };
  }
}
