import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MemberEntity } from "../../entities/member.entity";
import { ChurchEntity } from "../../entities/church.entity";
import { LifeGroupEntity } from "../../entities/lifegroup.entity";
import { EventEntity } from "../../entities/event.entity";
import { LG_NETWORK_CHURCH_TAG } from "../../utils/church-tags";

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MemberEntity) private readonly membersRepo: Repository<MemberEntity>,
    @InjectRepository(ChurchEntity) private readonly churchesRepo: Repository<ChurchEntity>,
    @InjectRepository(LifeGroupEntity) private readonly lifeGroupsRepo: Repository<LifeGroupEntity>,
    @InjectRepository(EventEntity) private readonly eventsRepo: Repository<EventEntity>
  ) {}

  async getDashboard() {
    const [memberCount, churchCounts, lifeGroupCount, kidsRow, upcomingEvents] = await Promise.all([
      this.membersRepo.count(),
      this.loadChurchCounts(),
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
      totalChurches: churchCounts.totalChurches,
      totalNetworkChurches: churchCounts.totalNetworkChurches,
      totalLifeGroups: lifeGroupCount,
      totalKids: Number(kidsRow?.[0]?.count || 0),
      upcomingEvents
    };
  }

  private async loadChurchCounts() {
    try {
      const [allRow, networkRow] = await Promise.all([
        this.churchesRepo.query(
          `SELECT COUNT(*) AS count
           FROM church c
           WHERE NOT EXISTS (
             SELECT 1
             FROM church_tag ct
             INNER JOIN tag t ON t.id = ct.tag_id AND LOWER(t.name) = ?
             WHERE ct.church_id = c.id
           )`,
          [LG_NETWORK_CHURCH_TAG.toLowerCase()]
        ),
        this.churchesRepo.query(
          `SELECT COUNT(DISTINCT c.id) AS count
           FROM church c
           INNER JOIN church_tag ct ON ct.church_id = c.id
           INNER JOIN tag t ON t.id = ct.tag_id AND LOWER(t.name) = ?`,
          [LG_NETWORK_CHURCH_TAG.toLowerCase()]
        )
      ]);
      return {
        totalChurches: Number(allRow?.[0]?.count || 0),
        totalNetworkChurches: Number(networkRow?.[0]?.count || 0)
      };
    } catch (err: any) {
      if (err?.code === "ER_NO_SUCH_TABLE") {
        const churchCount = await this.churchesRepo.count();
        return { totalChurches: churchCount, totalNetworkChurches: 0 };
      }
      throw err;
    }
  }

  private async loadUpcomingEvents() {
    try {
      const rows = await this.eventsRepo.query(
      `SELECT
        e.id,
        e.name,
        e.event_date AS eventDate,
        e.event_time AS eventTime,
        e.location,
        e.status,
        e.expected_participants AS expectedParticipants,
        e.reserved_participants AS reservedParticipants,
        COUNT(ep.id) AS registeredParticipants,
        (
          SELECT GROUP_CONCAT(s.session_date ORDER BY s.session_date)
          FROM event_session s
          WHERE s.event_id = e.id
        ) AS eventDates
      FROM event e
      LEFT JOIN event_participant ep ON ep.event_id = e.id
      WHERE e.status NOT IN ('cancelled', 'completed')
        AND (
          e.event_date IS NULL
          OR e.event_date >= CURDATE()
          OR EXISTS (
            SELECT 1
            FROM event_session s
            WHERE s.event_id = e.id
              AND s.session_date >= CURDATE()
          )
        )
      GROUP BY e.id, e.name, e.event_date, e.event_time, e.location, e.status, e.expected_participants, e.reserved_participants
      ORDER BY e.event_date IS NULL ASC, e.event_date ASC, e.event_time ASC, e.id ASC
      LIMIT 10`
    );

    return rows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      eventDate: row.eventDate || null,
      eventDates: String(row.eventDates || "")
        .split(",")
        .map((value) => value.trim().slice(0, 10))
        .filter(Boolean),
      eventTime: row.eventTime || null,
      location: row.location,
      status: row.status,
      expectedParticipants: row.expectedParticipants != null ? Number(row.expectedParticipants) : null,
      reservedParticipants: row.reservedParticipants != null ? Number(row.reservedParticipants) : 0,
      registeredParticipants: Number(row.registeredParticipants || 0)
    }));
    } catch (err: any) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
      const rows = await this.eventsRepo.query(
        `SELECT
          e.id,
          e.name,
          e.event_date AS eventDate,
          e.event_time AS eventTime,
          e.location,
          e.status,
          e.expected_participants AS expectedParticipants,
          e.reserved_participants AS reservedParticipants,
          COUNT(ep.id) AS registeredParticipants
        FROM event e
        LEFT JOIN event_participant ep ON ep.event_id = e.id
        WHERE e.status NOT IN ('cancelled', 'completed')
          AND (e.event_date IS NULL OR e.event_date >= CURDATE())
        GROUP BY e.id, e.name, e.event_date, e.event_time, e.location, e.status, e.expected_participants, e.reserved_participants
        ORDER BY e.event_date IS NULL ASC, e.event_date ASC, e.event_time ASC, e.id ASC
        LIMIT 10`
      );
      return rows.map((row: any) => ({
        id: Number(row.id),
        name: row.name,
        eventDate: row.eventDate || null,
        eventDates: [],
        eventTime: row.eventTime || null,
        location: row.location,
        status: row.status,
        expectedParticipants: row.expectedParticipants != null ? Number(row.expectedParticipants) : null,
        reservedParticipants: row.reservedParticipants != null ? Number(row.reservedParticipants) : 0,
        registeredParticipants: Number(row.registeredParticipants || 0)
      }));
    }
  }
}
