import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChurchEntity } from "../../entities/church.entity";
import { MemberEntity } from "../../entities/member.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";

@Injectable()
export class ChurchesService {
  constructor(
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>
  ) {}

  async add(body: any) {
    const pastorMemberId = body?.pastorMemberId ? Number(body.pastorMemberId) : null;
    const saved = await this.churchesRepo.save(
      this.churchesRepo.create({
        name: body.name,
        shortName: body.shortName || null,
        address: body.address,
        pastorMemberId
      })
    );
    if (pastorMemberId) {
      await this.membersRepo.update(pastorMemberId, { churchId: saved.id });
    }
    return this.view(saved.id);
  }

  async list() {
    const rows = await this.churchesRepo.find({ order: { id: "DESC" } });
    const members = await this.membersRepo.find();
    const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    return rows.map((c) => ({
      ...c,
      pastorName: c.pastorMemberId ? nameById.get(c.pastorMemberId) || "-" : "-"
    }));
  }

  async view(id: number) {
    const row = await this.churchesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Church not found");
    let pastorName = "-";
    if (row.pastorMemberId) {
      const pastor = await this.membersRepo.findOne({ where: { id: row.pastorMemberId } });
      if (pastor) pastorName = `${pastor.firstName} ${pastor.lastName}`;
    }
    const stats = await this.loadStats(id);
    return { ...row, pastorName, stats };
  }

  async listMembers(id: number) {
    const row = await this.churchesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Church not found");

    const memberSubquery = this.churchMemberSubquery(true);
    const memberParams = [id, id, id, id];

    const rows = await this.churchesRepo.query(
      `SELECT
        m.id,
        m.last_name AS lastName,
        m.first_name AS firstName,
        m.date_of_birth AS dateOfBirth,
        NULLIF((
          SELECT GROUP_CONCAT(DISTINCT lg.lifegroup_name ORDER BY lg.lifegroup_name SEPARATOR ', ')
          FROM lifegroup lg
          WHERE lg.church_id = ?
            AND (
              lg.coach_member_id = m.id
              OR EXISTS (
                SELECT 1 FROM lifegroup_member lm
                WHERE lm.lifegroup_id = lg.id AND lm.member_id = m.id
              )
            )
        ), '') AS lifeGroup
      FROM member m
      WHERE m.id IN (${memberSubquery})
      ORDER BY m.last_name ASC, m.first_name ASC, m.id ASC`,
      [id, ...memberParams]
    );

    return rows.map((member: any) => ({
      id: Number(member.id),
      lastName: member.lastName,
      firstName: member.firstName,
      dateOfBirth: member.dateOfBirth || null,
      lifeGroup: member.lifeGroup || null
    }));
  }

  async listLifeGroups(id: number) {
    const row = await this.churchesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Church not found");

    const rows = await this.churchesRepo.query(
      `SELECT
        lg.id,
        lg.lifegroup_name AS name,
        CONCAT(m.first_name, ' ', m.last_name) AS coachName,
        (
          SELECT COUNT(*)
          FROM lifegroup_member lm
          WHERE lm.lifegroup_id = lg.id
        ) + 1 AS memberCount
      FROM lifegroup lg
      INNER JOIN member m ON m.id = lg.coach_member_id
      WHERE lg.church_id = ?
      ORDER BY lg.lifegroup_name ASC, lg.id ASC`,
      [id]
    );

    return rows.map((group: any) => ({
      id: Number(group.id),
      name: group.name,
      coachName: group.coachName,
      memberCount: Number(group.memberCount || 0)
    }));
  }

  async listEvents(id: number) {
    const row = await this.churchesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Church not found");

    const memberSubquery = this.churchMemberSubquery(true);
    const memberParams = [id, id, id, id];

    const rows = await this.churchesRepo.query(
      `SELECT
        e.id,
        e.name,
        e.event_date AS eventDate,
        e.event_time AS eventTime,
        e.location,
        e.status,
        COUNT(DISTINCT ep.member_id) AS participantCount
      FROM event e
      INNER JOIN event_participant ep ON ep.event_id = e.id
      WHERE ep.member_id IN (${memberSubquery})
      GROUP BY e.id, e.name, e.event_date, e.event_time, e.location, e.status
      ORDER BY e.event_date DESC, e.name ASC, e.id DESC`,
      memberParams
    );

    return rows.map((event: any) => ({
      id: Number(event.id),
      name: event.name,
      eventDate: event.eventDate || null,
      eventTime: event.eventTime,
      location: event.location,
      status: event.status,
      participantCount: Number(event.participantCount || 0)
    }));
  }

  private churchMemberSubquery(includeDirectMembers = true) {
    const directMembers = includeDirectMembers
      ? `UNION
           SELECT m.id AS member_id
           FROM member m
           WHERE m.church_id = ?`
      : "";

    return `SELECT lg.coach_member_id AS member_id
           FROM lifegroup lg
           WHERE lg.church_id = ?
           UNION
           SELECT lm.member_id
           FROM lifegroup_member lm
           INNER JOIN lifegroup lg ON lg.id = lm.lifegroup_id
           WHERE lg.church_id = ?
           UNION
           SELECT c.pastor_member_id AS member_id
           FROM church c
           WHERE c.id = ? AND c.pastor_member_id IS NOT NULL
           ${directMembers}`;
  }

  private async loadStats(churchId: number) {
    const memberSubquery = this.churchMemberSubquery(true);
    const lifeGroupMemberSubquery = this.churchMemberSubquery(false);
    const memberParams = [churchId, churchId, churchId, churchId];
    const lifeGroupMemberParams = [churchId, churchId, churchId];

    const [memberRow, lifeGroupMemberRow, directMemberRow, lifeGroupCount, eventsRow] = await Promise.all([
      this.churchesRepo.query(
        `SELECT COUNT(DISTINCT member_id) AS count
         FROM (${memberSubquery}) AS church_members`,
        memberParams
      ),
      this.churchesRepo.query(
        `SELECT COUNT(DISTINCT member_id) AS count
         FROM (${lifeGroupMemberSubquery}) AS church_members`,
        lifeGroupMemberParams
      ),
      this.churchesRepo.query(`SELECT COUNT(*) AS count FROM member m WHERE m.church_id = ?`, [churchId]),
      this.lifeGroupsRepo.count({ where: { churchId } }),
      this.churchesRepo.query(
        `SELECT COUNT(DISTINCT ep.event_id) AS count
         FROM event_participant ep
         WHERE ep.member_id IN (${memberSubquery})`,
        memberParams
      )
    ]);

    return {
      memberCount: Number(memberRow[0]?.count || 0),
      lifeGroupMemberCount: Number(lifeGroupMemberRow[0]?.count || 0),
      directMemberCount: Number(directMemberRow[0]?.count || 0),
      lifeGroupCount,
      eventsParticipated: Number(eventsRow[0]?.count || 0)
    };
  }

  async edit(id: number, body: any) {
    const pastorMemberId = body?.pastorMemberId ? Number(body.pastorMemberId) : null;
    const existing = await this.churchesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Church not found");
    await this.churchesRepo.update(id, {
      name: body.name,
      shortName: body.shortName || null,
      address: body.address,
      pastorMemberId
    });
    if (pastorMemberId) {
      await this.membersRepo.update(pastorMemberId, { churchId: id });
    }
    return this.view(id);
  }

  async remove(id: number) {
    const existing = await this.churchesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Church not found");
    await this.churchesRepo.delete(id);
    return { id, deleted: true };
  }
}
