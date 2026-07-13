import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MemberEntity } from "../../entities/member.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { EventEntity } from "../../entities/event.entity";

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>,
    @InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>
  ) {}

  async getDashboard() {
    const [memberCount, churchCount, lifeGroupCount, kidsRow, upcomingEvents] = await Promise.all([
      this.membersRepo.count(),
      this.churchesRepo.count(),
      this.lifeGroupsRepo.count(),
      this.membersRepo.query(
        `SELECT COUNT(DISTINCT m.id) AS count
         FROM member m
         INNER JOIN member_tag mt ON mt.member_id = m.id
         INNER JOIN tag t ON t.id = mt.tag_id AND LOWER(t.name) = 'kids'`
      ),
      this.loadUpcomingEvents()
    ]);
    return {
      totalMembers: memberCount,
      totalChurches: churchCount,
      totalLifeGroups: lifeGroupCount,
      totalKids: Number(kidsRow?.[0]?.count || 0),
      upcomingEvents
    };
  }

  private async loadUpcomingEvents() {
    const rows = await this.eventsRepo.query(
      `SELECT
        e.id,
        e.name,
        e.event_date AS eventDate,
        e.event_time AS eventTime,
        e.location,
        e.status,
        e.expected_participants AS expectedParticipants,
        COUNT(ep.id) AS registeredParticipants
      FROM event e
      LEFT JOIN event_participant ep ON ep.event_id = e.id
      WHERE e.status NOT IN ('cancelled', 'completed')
        AND (e.event_date IS NULL OR e.event_date >= CURDATE())
      GROUP BY e.id, e.name, e.event_date, e.event_time, e.location, e.status, e.expected_participants
      ORDER BY e.event_date IS NULL ASC, e.event_date ASC, e.event_time ASC, e.id ASC
      LIMIT 10`
    );

    return rows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      eventDate: row.eventDate || null,
      eventTime: row.eventTime || null,
      location: row.location,
      status: row.status,
      expectedParticipants: row.expectedParticipants != null ? Number(row.expectedParticipants) : null,
      registeredParticipants: Number(row.registeredParticipants || 0)
    }));
  }
}
