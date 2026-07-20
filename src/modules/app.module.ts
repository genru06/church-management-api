import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthController } from "../shared/health.controller";
import { AuthGuard } from "../shared/auth.guard";
import { AuthController } from "../modules/auth/auth.controller";
import { AuthService } from "../modules/auth/auth.service";
import { DashboardController } from "../modules/dashboard/dashboard.controller";
import { DashboardService } from "../modules/dashboard/dashboard.service";
import { MembersController } from "../modules/members/members.controller";
import { MembersService } from "../modules/members/members.service";
import { ChurchesController } from "../modules/churches/churches.controller";
import { ChurchesService } from "../modules/churches/churches.service";
import { LifeGroupsController } from "../modules/lifegroups/lifegroups.controller";
import { LifeGroupsService } from "../modules/lifegroups/lifegroups.service";
import { AttendanceController } from "../modules/attendance/attendance.controller";
import { AttendanceService } from "../modules/attendance/attendance.service";
import { CitiesController } from "../modules/cities/cities.controller";
import { CitiesService } from "../modules/cities/cities.service";
import { EventsController } from "../modules/events/events.controller";
import { EventsService } from "../modules/events/events.service";
import { OperationsController } from "../modules/operations/operations.controller";
import { OperationsService } from "../modules/operations/operations.service";
import { UsersController } from "../modules/users/users.controller";
import { UsersService } from "../modules/users/users.service";
import { TagsController } from "../modules/tags/tags.controller";
import { TagsService } from "../modules/tags/tags.service";
import { AclResourceEntity } from "../entities/acl-resource.entity";
import { TagAclEntity } from "../entities/tag-acl.entity";
import { AclController } from "../modules/acl/acl.controller";
import { AclService } from "../modules/acl/acl.service";
import { UserEntity } from "../entities/user.entity";
import { UserAccessTagEntity } from "../entities/user-access-tag.entity";
import { UserTagEntity } from "../entities/user-tag.entity";
import { MemberEntity } from "../entities/member.entity";
import { MemberTagEntity } from "../entities/member-tag.entity";
import { TagEntity } from "../entities/tag.entity";
import { ChurchEntity } from "../entities/church.entity";
import { ChurchTagEntity } from "../entities/church-tag.entity";
import { LifeGroupEntity } from "../entities/lifegroup.entity";
import { LifeGroupMemberEntity } from "../entities/lifegroup-member.entity";
import { AttendanceEntity } from "../entities/attendance.entity";
import { CityEntity } from "../entities/city.entity";
import { EventEntity } from "../entities/event.entity";
import { EventParticipantEntity } from "../entities/event-participant.entity";
import { EventPledgeEntity } from "../entities/event-pledge.entity";
import { TitheEntity } from "../entities/tithe.entity";
import { OfferingEntity } from "../entities/offering.entity";
import { ExpenseEntity } from "../entities/expense.entity";
import { VoucherEntity } from "../entities/voucher.entity";

const entities = [
  UserEntity,
  UserAccessTagEntity,
  UserTagEntity,
  AclResourceEntity,
  TagAclEntity,
  MemberEntity,
  MemberTagEntity,
  TagEntity,
  ChurchEntity,
  ChurchTagEntity,
  LifeGroupEntity,
  LifeGroupMemberEntity,
  AttendanceEntity,
  CityEntity,
  EventEntity,
  EventParticipantEntity,
  EventPledgeEntity,
  TitheEntity,
  OfferingEntity,
  ExpenseEntity,
  VoucherEntity
];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "mysql",
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "lifegroup_system",
      entities,
      synchronize: false
    }),
    TypeOrmModule.forFeature(entities)
  ],
  controllers: [
    HealthController,
    AuthController,
    DashboardController,
    MembersController,
    ChurchesController,
    LifeGroupsController,
    AttendanceController,
    CitiesController,
    EventsController,
    OperationsController,
    UsersController,
    TagsController,
    AclController
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    DashboardService,
    MembersService,
    ChurchesService,
    LifeGroupsService,
    AttendanceService,
    CitiesService,
    EventsService,
    OperationsService,
    UsersService,
    TagsService,
    AclService
  ]
})
export class AppModule {}
