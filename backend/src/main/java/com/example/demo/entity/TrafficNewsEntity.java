package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "TRAFFIC_NEWS")
@Getter
@NoArgsConstructor
public class TrafficNewsEntity {

    @Id
    @Column(name = "LINK", length = 500)
    private String link;

    @Column(name = "CATEGORY", length = 50)
    private String category;

    @Column(name = "TITLE", length = 500)
    private String title;

    @Column(name = "SUMMARY", length = 1000)
    private String summary;

    @Column(name = "SENTIMENT", length = 20)
    private String sentiment;

    @Column(name = "PUB_DATE", length = 50)
    private String pubDate;

    @Column(name = "CLICKBAIT_PROB", length = 20)
    private String clickbaitProb;

    @Column(name = "ARTICLE_TYPE", length = 20)
    private String articleType;

    @Column(name = "TYPE_PROB", length = 20)
    private String typeProb;
}
