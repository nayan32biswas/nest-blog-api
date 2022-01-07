import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { ImageType, KeyObject } from 'src/common/types/common.type';
import { UserEntity } from '../user.entity';
import { UserUpdateDto } from '../dto/user.dto';
import { UserSerializer } from '../dto/user.serializer';
import { PostListQuery } from 'src/post/dto/post.urlParser.dto';
import { PostListSerializer } from 'src/post/dto/post.serializer.dto';
import { PostEntity } from 'src/post/post.entity';
// import { AuthService } from '../../auth/service/auth.service';
// private readonly authService: AuthService,

const saltOrRounds = 10;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}
  async registration(userData: KeyObject): Promise<UserEntity> {
    const { password, email, firstName, lastName, role } = userData;

    const previousUser = await this.userRepository.findOne({ email: email });
    if (previousUser) {
      throw new HttpException(
        'User already exists with this email',
        HttpStatus.BAD_REQUEST,
      );
    }

    const hashPass = await bcrypt.hash(password, saltOrRounds);

    const user = new UserEntity();
    user.password = hashPass;
    user.email = email;
    user.username = email.match(/^([^@]*)@/)[1];
    user.firstName = firstName;
    user.lastName = lastName;
    user.role = role;

    await this.userRepository.save(user);
    return user;
  }
  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.userRepository.findOne({ username: username });
    if (!user) return null;
    const isMatch = await bcrypt.compare(pass, user.password);
    if (isMatch) {
      const { ...result } = user;
      return result;
    }
    return null;
  }
  async login(user: any) {
    const payload = { username: user.username, id: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: 'Implement It',
    };
  }

  async getProfile(id: number) {
    const user = await this.userRepository.findOne(id);
    return new UserSerializer(user);
  }

  async update(
    id: string,
    userData: UserUpdateDto,
    picture: ImageType,
  ): Promise<UserEntity> {
    const { firstName, lastName, birthDate } = userData;

    const user = await this.userRepository.findOne(id);

    firstName !== user.firstName && (user.firstName = firstName);
    lastName !== user.lastName && (user.lastName = lastName);
    birthDate !== user.birthDate && (user.birthDate = birthDate);
    picture !== undefined && (user.picture = picture.path);

    return await this.userRepository.save(user);
  }
  async delete(id: number): Promise<void> {
    const user = await this.userRepository.findOne(id);
    this.userRepository.remove(user);
  }

  async getUserPosts(
    userId: number,
    query: PostListQuery,
  ): Promise<PostListSerializer[]> {
    let queryBuilder = PostEntity.getRepository().createQueryBuilder();
    if (query.offset) {
      queryBuilder = queryBuilder.offset(query.offset);
    }
    if (query.tag) {
      queryBuilder = queryBuilder.innerJoin(
        'PostEntity.tags',
        'TagEntity',
        'TagEntity.name = :tag',
        { tag: query.tag },
      );
    }
    queryBuilder = queryBuilder
      .leftJoinAndSelect('PostEntity.user', 'UserEntity')
      .andWhere('UserEntity.id = :id', {
        id: userId,
      });

    if (query.q) {
      queryBuilder = queryBuilder.andWhere(
        'PostEntity.slug = :slug OR PostEntity.title LIKE :title',
        {
          slug: `%${query.q}%`,
          title: `%${query.q}%`,
        },
      );
    }
    if (query.limit) {
      const limit = Math.min(query.limit, 50);
      queryBuilder = queryBuilder.limit(limit);
    }
    queryBuilder.innerJoinAndSelect('PostEntity.user', 'user');
    const posts = await queryBuilder.getMany();
    return posts.map((post: PostEntity) => new PostListSerializer(post));
  }
}