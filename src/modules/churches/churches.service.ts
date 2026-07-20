import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChurchEntity } from "../../entities/church.entity";
import { ChurchTagEntity } from "../../entities/church-tag.entity";
import { MemberEntity } from "../../entities/member.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { TagEntity } from "../../entities/tag.entity";
import { sortChurchesMainFirst } from "../../utils/church-display";

@Injectable()
export class ChurchesService {
  constructor(
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(ChurchTagEntity) private readonly churchTagsRepo: Repository<ChurchTagEntity>,
    @InjectRepository(TagEntity) private readonly tagsRepo: Repository<TagEntity>,
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
    await this.setChurchTags(Number(saved.id), body.tags);
    return this.view(Number(saved.id));
  }

  async list() {
    const rows = await this.churchesRepo.find({ order: { id: "DESC" } });
    const members = await this.membersRepo.find();
    const nameById = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
    const tagMap = await this.loadChurchTags(rows.map((c) => Number(c.id)));
    return sortChurchesMainFirst(
      rows.map((c) => ({
        ...c,
        pastorName: c.pastorMemberId ? nameById.get(c.pastorMemberId) || "-" : "-",
        tags: tagMap.get(Number(c.id)) || []
      }))
    );
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
    return {
      ...row,
      pastorName,
      stats,
      tags: (await this.loadChurchTags([id])).get(Number(id)) || []
    };
  }

  async listMembers(id: number) {
    const row = await this.churchesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException("Church not found");

    const memberSubquery = this.churchMemberSubquery(true);
    const memberParams = [id, id, id, id, id, id, id];

    const rows = await this.churchesRepo.query(
      `SELECT
        m.id,
        m.last_name AS lastName,
        m.first_name AS firstName,
        m.date_of_birth AS dateOfBirth,
        CASE WHEN m.church_id = ? THEN 1 ELSE 0 END AS linkedDirectly,
        CASE WHEN EXISTS (
          SELECT 1
          FROM lifegroup lg
          WHERE lg.church_id = ?
            AND (
              lg.coach_member_id = m.id
              OR EXISTS (
                SELECT 1 FROM lifegroup_member lm
                WHERE lm.lifegroup_id = lg.id AND lm.member_id = m.id
              )
            )
        ) THEN 1 ELSE 0 END AS linkedViaLifeGroup,
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
        ), '') AS lifeGroup,
        NULLIF((
          SELECT GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ')
          FROM member_tag mt
          INNER JOIN tag t ON t.id = mt.tag_id
          WHERE mt.member_id = m.id
        ), '') AS tags
      FROM member m
      WHERE m.id IN (${memberSubquery})
      ORDER BY m.last_name ASC, m.first_name ASC, m.id ASC`,
      memberParams
    );

    return rows.map((member: any) => ({
      id: Number(member.id),
      lastName: member.lastName,
      firstName: member.firstName,
      dateOfBirth: member.dateOfBirth || null,
      lifeGroup: member.lifeGroup || null,
      tags: member.tags ? String(member.tags).split(", ") : [],
      linkType: this.formatMemberLinkType(
        Number(member.linkedDirectly) === 1,
        Number(member.linkedViaLifeGroup) === 1
      )
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
        ) + CASE WHEN lg.coach_member_id IS NOT NULL THEN 1 ELSE 0 END AS memberCount
      FROM lifegroup lg
      LEFT JOIN member m ON m.id = lg.coach_member_id
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
           WHERE lg.church_id = ? AND lg.coach_member_id IS NOT NULL
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

    const [memberRow, lifeGroupMemberRow, directMemberRow, kidsMemberRow, lifeGroupCount, eventsRow] =
      await Promise.all([
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
      this.churchesRepo.query(
        `SELECT COUNT(DISTINCT m.id) AS count
         FROM member m
         INNER JOIN member_tag mt ON mt.member_id = m.id
         INNER JOIN tag t ON t.id = mt.tag_id AND LOWER(t.name) = 'kids'
         WHERE m.id IN (${memberSubquery})`,
        memberParams
      ),
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
      kidsMemberCount: Number(kidsMemberRow[0]?.count || 0),
      lifeGroupCount,
      eventsParticipated: Number(eventsRow[0]?.count || 0)
    };
  }

  private formatMemberLinkType(linkedDirectly: boolean, linkedViaLifeGroup: boolean) {
    const parts: string[] = [];
    if (linkedDirectly) parts.push("Direct");
    if (linkedViaLifeGroup) parts.push("Lifegroup");
    return parts.length ? parts.join(" · ") : "—";
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
    if (body?.tags !== undefined) {
      await this.setChurchTags(Number(id), body.tags);
    }
    return this.view(Number(id));
  }

  async remove(id: number) {
    const existing = await this.churchesRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("Church not found");
    try {
      await this.churchesRepo.query(`DELETE FROM church_tag WHERE church_id = ?`, [Number(id)]);
    } catch (err: any) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
    }
    await this.churchesRepo.delete(id);
    return { id, deleted: true };
  }

  private normalizeTagNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const tag of value) {
      const name = String(tag || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  }

  private async resolveTagsByNames(tagNames: string[]): Promise<TagEntity[]> {
    const resolved: TagEntity[] = [];
    const seenIds = new Set<number>();

    for (const name of tagNames) {
      const tag = await this.tagsRepo
        .createQueryBuilder("tag")
        .where("LOWER(tag.name) = LOWER(:name)", { name })
        .getOne();
      if (!tag) throw new BadRequestException(`Unknown tag: ${name}`);
      const tagId = Number(tag.id);
      if (seenIds.has(tagId)) continue;
      seenIds.add(tagId);
      resolved.push(tag);
    }

    return resolved;
  }

  private async setChurchTags(churchId: number, value: unknown) {
    const id = Number(churchId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException("Invalid church id for tags");
    }

    const tagNames = this.normalizeTagNames(value);
    const tags = tagNames.length ? await this.resolveTagsByNames(tagNames) : [];

    try {
      await this.churchesRepo.query(`DELETE FROM church_tag WHERE church_id = ?`, [id]);
      if (!tags.length) return;

      const valuesSql = tags.map(() => "(?, ?)").join(", ");
      const params = tags.flatMap((tag) => [id, Number(tag.id)]);
      await this.churchesRepo.query(
        `INSERT INTO church_tag (church_id, tag_id) VALUES ${valuesSql}`,
        params
      );
    } catch (err: any) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        throw new BadRequestException(
          "church_tag table is missing. Run database/church-tags-migration.sql on the database."
        );
      }
      throw err;
    }
  }

  private async loadChurchTags(churchIds: number[]) {
    const map = new Map<number, string[]>();
    const ids = [...new Set(churchIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!ids.length) return map;

    try {
      const placeholders = ids.map(() => "?").join(", ");
      const rows: { churchId: string | number; name: string }[] = await this.churchesRepo.query(
        `SELECT ct.church_id AS churchId, t.name AS name
         FROM church_tag ct
         INNER JOIN tag t ON t.id = ct.tag_id
         WHERE ct.church_id IN (${placeholders})
         ORDER BY t.name ASC`,
        ids
      );

      rows.forEach((row) => {
        const churchId = Number(row.churchId);
        const existing = map.get(churchId) || [];
        existing.push(row.name);
        map.set(churchId, existing);
      });
      return map;
    } catch (err: any) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        throw new BadRequestException(
          "church_tag table is missing. Run database/church-tags-migration.sql on the database."
        );
      }
      throw err;
    }
  }
}
